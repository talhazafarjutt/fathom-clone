import type Anthropic from "@anthropic-ai/sdk";
import {
  ANTHROPIC_MODEL,
  GROQ_MODEL,
  anthropic,
  groq,
  llmProvider,
} from "@/lib/ai/providers";
import { parseTimestamp, renderTranscript, type SegmentLike } from "@/lib/transcript";

const SYSTEM_RULES = `You answer questions about a single recorded meeting, using only its transcript.

Rules:
- Answer only from the transcript. If it does not contain the answer, say so plainly.
- Cite evidence with the transcript timestamp in square brackets, e.g. [12:04]. Cite at least one timestamp whenever you make a factual claim.
- Be concise: a short paragraph or a few bullets. No preamble.`;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type Citation = { startMs: number; label: string };

/** Pull the [m:ss] markers the model emitted so the UI can make them seekable. */
export function extractCitations(text: string): Citation[] {
  const seen = new Set<number>();
  const out: Citation[] = [];
  for (const match of text.matchAll(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g)) {
    const startMs = parseTimestamp(match[1]);
    if (startMs === null || seen.has(startMs)) continue;
    seen.add(startMs);
    out.push({ startMs, label: match[1] });
  }
  return out;
}

export function streamMeetingAnswer(opts: {
  segments: SegmentLike[];
  speakerNames?: Record<string, string> | null;
  history: ChatTurn[];
  question: string;
  onDone?: (fullText: string) => Promise<void> | void;
  onError?: (error: unknown) => Promise<void> | void;
}): ReadableStream<Uint8Array> {
  const transcript = renderTranscript(opts.segments, opts.speakerNames);
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      const push = (text: string) => {
        full += text;
        controller.enqueue(encoder.encode(text));
      };

      try {
        const deltas =
          llmProvider() === "groq"
            ? groqDeltas(transcript, opts.history, opts.question)
            : claudeDeltas(transcript, opts.history, opts.question);

        for await (const delta of deltas) push(delta);

        await opts.onDone?.(full);
        controller.close();
      } catch (error) {
        await opts.onError?.(error);
        controller.enqueue(
          encoder.encode("\n\n_Something went wrong generating this answer._"),
        );
        controller.close();
      }
    },
  });
}

async function* groqDeltas(
  transcript: string,
  history: ChatTurn[],
  question: string,
): AsyncGenerator<string> {
  const stream = await groq().chat.completions.create({
    model: GROQ_MODEL,
    stream: true,
    temperature: 0.3,
    max_completion_tokens: 4000,
    messages: [
      { role: "system", content: `${SYSTEM_RULES}\n\n<transcript>\n${transcript}\n</transcript>` },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user" as const, content: question },
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

async function* claudeDeltas(
  transcript: string,
  history: ChatTurn[],
  question: string,
): AsyncGenerator<string> {
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: SYSTEM_RULES },
    {
      type: "text",
      text: `<transcript>\n${transcript}\n</transcript>`,
      // The transcript is identical on every follow-up question — cache it.
      cache_control: { type: "ephemeral" },
    },
  ];

  const stream = anthropic().messages.stream({
    model: ANTHROPIC_MODEL,
    max_tokens: 8000,
    system,
    messages: [
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user" as const, content: question },
    ],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}
