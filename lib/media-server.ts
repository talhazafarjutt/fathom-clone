import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Server-only half of media handling: probing for ffmpeg and transcoding.
 * Kept out of lib/media.ts because that module is imported by a client
 * component, and bundling node:child_process for the browser breaks the build.
 */

let ffmpegChecked: boolean | null = null;

export async function ffmpegAvailable(): Promise<boolean> {
  if (ffmpegChecked !== null) return ffmpegChecked;
  ffmpegChecked = await new Promise<boolean>((resolve) => {
    const probe = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    probe.on("error", () => resolve(false));
    probe.on("close", (code) => resolve(code === 0));
  });
  return ffmpegChecked;
}

/**
 * Extract a speech-optimised audio track: mono, 16 kHz, 64 kbps MP3. That is
 * what Whisper wants anyway, and it turns an 87 MB screen recording into
 * something around 5 MB.
 */
export async function transcodeToMp3(inputPath: string, outputPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-nostdin",
      "-loglevel", "error",
      "-i", inputPath,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-b:a", "64k",
      "-y", outputPath,
    ]);

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => {
      stderr += String(chunk).slice(0, 2000);
    });
    ffmpeg.on("error", (error) =>
      reject(new Error(`ffmpeg could not be started: ${error.message}`)),
    );
    ffmpeg.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg failed (exit ${code}): ${stderr.trim() || "no output"}`)),
    );
  });
}

export async function makeTempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "cadence-"));
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => {}),
  };
}
