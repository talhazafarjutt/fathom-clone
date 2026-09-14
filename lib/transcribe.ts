import { createReadStream } from "node:fs";
import { AssemblyAI } from "assemblyai";
import { getProviderReadUrl, localObjectPath, storageDriver } from "@/lib/storage";

export type Utterance = {
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
};

export type TranscriptResult =
  | { status: "processing" }
  | { status: "error"; error: string }
  | { status: "completed"; utterances: Utterance[]; durationSec: number | null };

let client: AssemblyAI | null = null;

function aai() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("Missing ASSEMBLYAI_API_KEY");
  if (!client) client = new AssemblyAI({ apiKey });
  return client;
}

/**
 * Hand the media to AssemblyAI and return the transcript id immediately.
 * R2 objects are passed by signed URL; local files are streamed to AssemblyAI's
 * upload endpoint because localhost isn't reachable from their workers.
 */
export async function submitTranscription(storageKey: string): Promise<string> {
  let audio: string;
  if (storageDriver === "local") {
    audio = await aai().files.upload(createReadStream(localObjectPath(storageKey)));
  } else {
    const url = await getProviderReadUrl(storageKey);
    if (!url) throw new Error("Could not resolve a provider-readable URL");
    audio = url;
  }

  const transcript = await aai().transcripts.submit({
    audio,
    speaker_labels: true,
    punctuate: true,
    format_text: true,
    language_detection: true,
  });

  return transcript.id;
}

export async function fetchTranscription(id: string): Promise<TranscriptResult> {
  const t = await aai().transcripts.get(id);

  if (t.status === "error") {
    return { status: "error", error: t.error ?? "Transcription failed" };
  }
  if (t.status !== "completed") {
    return { status: "processing" };
  }

  // Prefer diarized utterances; fall back to one block when diarization is empty
  const utterances: Utterance[] =
    t.utterances?.map((u) => ({
      speaker: u.speaker,
      startMs: u.start,
      endMs: u.end,
      text: u.text,
      confidence: u.confidence ?? null,
    })) ??
    (t.text
      ? [
          {
            speaker: "A",
            startMs: 0,
            endMs: Math.round((t.audio_duration ?? 0) * 1000),
            text: t.text,
            confidence: t.confidence ?? null,
          },
        ]
      : []);

  return {
    status: "completed",
    utterances,
    durationSec: t.audio_duration ?? null,
  };
}
