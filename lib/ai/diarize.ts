import { z } from "zod";
import { GROQ_MODEL, groq, toStrictJsonSchema } from "@/lib/ai/providers";
import { formatTimestamp } from "@/lib/transcript";

/**
 * Whisper returns text with timestamps but no speaker labels. When Groq is the
 * transcription provider, this asks an LLM where the speaker changes and
 * assigns letters from those turn boundaries.
 *
 * This is *inferred*, not measured: it reads conversational cues, so it is
 * wrong sometimes. Meetings transcribed this way are flagged in the database
 * and in the UI so nobody mistakes a guess for diarization.
 */

const TurnsSchema = z.object({
  speakerCount: z.number().int().min(1).max(12),
  turns: z
    .array(
      z.object({
        startIndex: z.number().int().min(0).describe("Index of the first line of this turn"),
        speaker: z.string().describe('Single uppercase letter: "A", "B", "C", ...'),
      }),
    )
    .describe("Speaker turns in order, starting at index 0"),
});

const SYSTEM = `You segment a meeting transcript into speaker turns.

You are given numbered lines with timestamps. Decide where the speaker changes.

Rules:
- Line 0 always starts a turn.
- Use conversational evidence only: questions followed by answers, greetings, self-introductions, "as I said", agreement or disagreement, topic handoffs.
- Speakers are labelled A, B, C, ... in order of first appearance.
- Most meetings have 2-5 speakers. Do not invent extra speakers to explain every pause.
- Consecutive lines from the same person are one turn. Do not emit a turn per line.`;

export type SpeakerAssignment = { idx: number; speaker: string };

export async function inferSpeakers(
  lines: { idx: number; startMs: number; text: string }[],
): Promise<SpeakerAssignment[]> {
  const fallback = lines.map((line) => ({ idx: line.idx, speaker: "A" }));

  // Long transcripts blow the useful accuracy of turn inference; a single
  // speaker is a more honest answer than a confident guess.
  if (lines.length === 0 || lines.length > 400) return fallback;

  const numbered = lines
    .map((line) => `${line.idx} [${formatTimestamp(line.startMs)}] ${line.text}`)
    .join("\n");

  try {
    const completion = await groq().chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0,
      max_completion_tokens: 8000,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Transcript lines:\n\n${numbered}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "speaker_turns",
          strict: true,
          schema: toStrictJsonSchema(z.toJSONSchema(TurnsSchema)),
        },
      } as never,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return fallback;

    const parsed = TurnsSchema.parse(JSON.parse(content));
    const turns = parsed.turns
      .filter((turn) => turn.startIndex >= 0 && turn.startIndex < lines.length)
      .sort((a, b) => a.startIndex - b.startIndex);

    if (turns.length === 0) return fallback;

    return lines.map((line) => {
      let speaker = turns[0].speaker;
      for (const turn of turns) {
        if (turn.startIndex <= line.idx) speaker = turn.speaker;
        else break;
      }
      return { idx: line.idx, speaker: normalise(speaker) };
    });
  } catch {
    return fallback;
  }
}

function normalise(speaker: string) {
  const letter = speaker.trim().toUpperCase().charAt(0);
  return /[A-Z]/.test(letter) ? letter : "A";
}
