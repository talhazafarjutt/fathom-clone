import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  ANTHROPIC_MODEL,
  GROQ_MODEL,
  anthropic,
  groq,
  llmProvider,
  toStrictJsonSchema,
} from "@/lib/ai/providers";
import { renderTranscript, type SegmentLike } from "@/lib/transcript";

const Timestamp = z
  .string()
  .describe('Timestamp from the transcript, "m:ss" or "h:mm:ss". Empty string if unknown.');

const MeetingSummarySchema = z.object({
  title: z.string().describe("Short, specific meeting title (max 8 words)"),
  tldr: z.string().describe("2-3 sentence executive summary"),
  bullets: z.array(z.string()).describe("4-8 key points, each one sentence"),
  topics: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
        timestamp: Timestamp,
      }),
    )
    .describe("Chapters, in chronological order"),
  questions: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string().describe('Answer given in the call, or "Unanswered"'),
        timestamp: Timestamp,
      }),
    )
    .describe("Notable questions raised"),
  keywords: z.array(z.string()).describe("3-10 topic keywords"),
  actionItems: z
    .array(
      z.object({
        text: z.string().describe("Imperative phrasing: 'Send the pricing deck'"),
        assignee: z.string().describe("Person responsible, or empty string"),
        dueDate: z.string().describe('Due date as said, e.g. "next Friday", or empty string'),
        timestamp: Timestamp,
      }),
    )
    .describe("Concrete commitments only — no vague intentions"),
  speakers: z
    .array(
      z.object({
        speaker: z.string().describe('Diarization label exactly as given, e.g. "A"'),
        name: z
          .string()
          .describe("Real name if someone is introduced or addressed by name, else empty string"),
      }),
    )
    .describe("Best-effort mapping of diarization labels to real names"),
});

export type MeetingSummary = z.infer<typeof MeetingSummarySchema>;

const SYSTEM = `You are a meeting analyst. You are given a diarized transcript with timestamps.

Rules:
- Ground every statement in the transcript. Never invent names, numbers, dates, or commitments.
- Action items are explicit commitments someone made. If nobody committed to anything, return an empty list.
- Every timestamp you emit must be copied from a transcript line that supports the statement.
- Write in plain, concrete language. No filler, no "the team discussed various topics".`;

function userPrompt(transcript: string) {
  return `Analyse this meeting transcript.\n\n<transcript>\n${transcript}\n</transcript>`;
}

export async function summarizeMeeting(
  segments: SegmentLike[],
  speakerNames?: Record<string, string> | null,
): Promise<MeetingSummary> {
  const transcript = renderTranscript(segments, speakerNames);

  return llmProvider() === "groq"
    ? summarizeWithGroq(transcript)
    : summarizeWithClaude(transcript);
}

/** Groq: strict JSON-schema decoding, so the model cannot return off-shape JSON. */
async function summarizeWithGroq(transcript: string): Promise<MeetingSummary> {
  const schema = toStrictJsonSchema(z.toJSONSchema(MeetingSummarySchema));

  const completion = await groq().chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.2,
    max_completion_tokens: 16000,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userPrompt(transcript) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "meeting_summary", strict: true, schema },
    } as never,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Groq returned an empty summary");

  return MeetingSummarySchema.parse(JSON.parse(content));
}

/** Claude: structured outputs against the same Zod schema. */
async function summarizeWithClaude(transcript: string): Promise<MeetingSummary> {
  const response = await anthropic().messages.parse({
    model: ANTHROPIC_MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: {
      effort: "medium",
      format: zodOutputFormat(MeetingSummarySchema),
    },
    messages: [{ role: "user", content: userPrompt(transcript) }],
  });

  if (!response.parsed_output) {
    throw new Error("Model did not return a parseable summary");
  }
  return response.parsed_output;
}
