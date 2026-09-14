import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { AssemblyAI } from "assemblyai";
import { toFile } from "groq-sdk";
import { inferSpeakers } from "@/lib/ai/diarize";
import { groq } from "@/lib/ai/providers";
import { extensionOf, needsTranscode, supportedFormatsMessage } from "@/lib/media";
import { ffmpegAvailable, makeTempDir, transcodeToMp3 } from "@/lib/media-server";
import {
  getProviderReadUrl,
  localObjectPath,
  storageDriver,
} from "@/lib/storage";

export type Utterance = {
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
};

export type CompletedTranscript = {
  status: "completed";
  utterances: Utterance[];
  durationSec: number | null;
  /** true when speaker labels were guessed by an LLM rather than measured */
  speakersInferred: boolean;
  /** set when the upload had to be transcoded; the caller stores it for playback */
  transcodedAudio?: { buffer: Buffer; extension: string; contentType: string };
};

export type TranscriptResult =
  | { status: "processing" }
  | { status: "error"; error: string }
  | CompletedTranscript;

/**
 * Two transcription providers with different shapes:
 *
 *   assemblyai — real diarization. Asynchronous: submit, then poll.
 *   groq       — Whisper large v3. Cheap and fast, but NO diarization, so
 *                speaker labels are inferred afterwards (see lib/ai/diarize.ts).
 *                Synchronous: one call returns the whole transcript.
 */
export type TranscriptionProvider = "assemblyai" | "groq";

export function transcriptionProvider(): TranscriptionProvider {
  const explicit = process.env.TRANSCRIBE_PROVIDER?.toLowerCase();
  if (explicit === "assemblyai" || explicit === "groq") return explicit;
  return process.env.ASSEMBLYAI_API_KEY ? "assemblyai" : "groq";
}

export function isAsyncTranscription() {
  return transcriptionProvider() === "assemblyai";
}

const GROQ_WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3";

// Groq caps uploads at 25 MB on the free tier, 100 MB on the dev tier.
const GROQ_MAX_BYTES = Number(process.env.GROQ_AUDIO_MAX_BYTES || 25 * 1024 * 1024);

// Ceilings on merging Whisper segments into one transcript line.
const MAX_MERGED_MS = 25_000;
const MAX_MERGED_CHARS = 320;

let assembly: AssemblyAI | null = null;

function aai() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("Missing ASSEMBLYAI_API_KEY");
  if (!assembly) assembly = new AssemblyAI({ apiKey });
  return assembly;
}

// ---------------------------------------------------------------------------
// AssemblyAI (asynchronous)
// ---------------------------------------------------------------------------

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
    speakersInferred: false,
  };
}

// ---------------------------------------------------------------------------
// Groq Whisper (synchronous)
// ---------------------------------------------------------------------------

/** One call: transcribe, then infer speaker turns from the text. */
export async function transcribeWithGroq(storageKey: string): Promise<CompletedTranscript> {
  const { file, transcodedAudio, cleanup } = await loadAudioForGroq(storageKey);
  try {
    return await runGroqTranscription(file, transcodedAudio);
  } finally {
    await cleanup();
  }
}

async function runGroqTranscription(
  file: Awaited<ReturnType<typeof toFile>>,
  transcodedAudio: CompletedTranscript["transcodedAudio"],
): Promise<CompletedTranscript> {

  const response = (await groq().audio.transcriptions.create({
    file,
    model: GROQ_WHISPER_MODEL,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  })) as unknown as {
    text?: string;
    duration?: number;
    segments?: { start: number; end: number; text: string; avg_logprob?: number }[];
  };

  const raw = (response.segments ?? [])
    .map((segment) => ({
      startMs: Math.round(segment.start * 1000),
      endMs: Math.round(segment.end * 1000),
      text: segment.text.trim(),
      confidence: segment.avg_logprob !== undefined ? clamp01(Math.exp(segment.avg_logprob)) : null,
    }))
    .filter((segment) => segment.text.length > 0);

  if (raw.length === 0) {
    return {
      transcodedAudio,
      status: "completed",
      utterances: response.text
        ? [
            {
              speaker: "A",
              startMs: 0,
              endMs: Math.round((response.duration ?? 0) * 1000),
              text: response.text.trim(),
              confidence: null,
            },
          ]
        : [],
      durationSec: response.duration ?? null,
      speakersInferred: false,
    };
  }

  const speakers = await inferSpeakers(
    raw.map((segment, idx) => ({ idx, startMs: segment.startMs, text: segment.text })),
  );
  const speakerByIdx = new Map(speakers.map((s) => [s.idx, s.speaker]));

  // Merge consecutive Whisper segments from the same speaker into readable
  // lines — but cap it. A one-speaker recording would otherwise collapse into a
  // single unclickable wall of text, and the timestamps are the whole point:
  // they drive seeking, follow-along highlighting, and search snippets.
  const utterances: Utterance[] = [];
  raw.forEach((segment, idx) => {
    const speaker = speakerByIdx.get(idx) ?? "A";
    const previous = utterances.at(-1);
    const canMerge =
      previous &&
      previous.speaker === speaker &&
      segment.endMs - previous.startMs <= MAX_MERGED_MS &&
      previous.text.length + segment.text.length <= MAX_MERGED_CHARS;

    if (canMerge) {
      previous.endMs = segment.endMs;
      previous.text = `${previous.text} ${segment.text}`.trim();
    } else {
      utterances.push({ ...segment, speaker });
    }
  });

  return {
    transcodedAudio,
    status: "completed",
    utterances,
    durationSec: response.duration ?? raw.at(-1)!.endMs / 1000,
    speakersInferred: true,
  };
}

/**
 * Produce a file Groq will accept: the original when it is already a supported
 * audio format of a workable size, otherwise an ffmpeg-extracted MP3.
 */
async function loadAudioForGroq(storageKey: string) {
  const temp = await makeTempDir();
  try {
    const sourceName = basename(storageKey);
    let sourcePath: string;
    let sizeBytes: number;

    if (storageDriver === "local") {
      sourcePath = localObjectPath(storageKey);
      ({ size: sizeBytes } = await stat(sourcePath));
    } else {
      const url = await getProviderReadUrl(storageKey);
      if (!url) throw new Error("Could not resolve a provider-readable URL");
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Could not read media from storage (${response.status})`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      sizeBytes = buffer.byteLength;
      sourcePath = path.join(temp.dir, sourceName);
      await writeFile(sourcePath, buffer);
    }

    if (!needsTranscode(sourceName, sizeBytes, GROQ_MAX_BYTES)) {
      return {
        file: await toFile(createReadStream(sourcePath), sourceName),
        transcodedAudio: undefined,
        cleanup: temp.cleanup,
      };
    }

    if (!(await ffmpegAvailable())) {
      throw new Error(
        `This recording is a .${extensionOf(sourceName)} file${
          sizeBytes > GROQ_MAX_BYTES ? " and is over the provider's size limit" : ""
        }, and ffmpeg is not installed on the server to convert it. ` +
          `Convert it to MP3 first, or run the app with ffmpeg available. ${supportedFormatsMessage()}`,
      );
    }

    const outputPath = path.join(temp.dir, "audio.mp3");
    await transcodeToMp3(sourcePath, outputPath);
    const buffer = await readFile(outputPath);

    if (buffer.byteLength > GROQ_MAX_BYTES) {
      throw new Error(
        `Even after extracting the audio this recording is ${(
          buffer.byteLength /
          1024 /
          1024
        ).toFixed(1)} MB, over the ${(GROQ_MAX_BYTES / 1024 / 1024).toFixed(0)} MB limit. ` +
          "Use TRANSCRIBE_PROVIDER=assemblyai for meetings this long.",
      );
    }

    return {
      file: await toFile(buffer, "audio.mp3"),
      transcodedAudio: {
        buffer,
        extension: "mp3",
        contentType: "audio/mpeg",
      },
      cleanup: temp.cleanup,
    };
  } catch (error) {
    await temp.cleanup();
    throw error;
  }
}

function basename(key: string) {
  return key.split("/").pop() || "audio.webm";
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
