/**
 * Format rules for uploaded media. Deliberately free of node imports so the
 * upload UI can validate a file before a byte leaves the browser; the ffmpeg
 * half lives in media-server.ts.
 *
 * Users hand us whatever their meeting tool produced — often a .mkv or .mov
 * screen recording. Speech-to-text providers accept a narrower list, and Groq
 * additionally caps upload size. So:
 *
 *   1. the browser and the API reject formats we cannot handle at all, before
 *      a large file is uploaded and stored;
 *   2. anything the provider will not take directly (or that is too big) is
 *      transcoded to 16 kHz mono MP3 with ffmpeg, which also shrinks a video
 *      file by an order of magnitude because the video track is dropped.
 */

/** What Groq's Whisper endpoint accepts directly. */
export const PROVIDER_NATIVE_EXTENSIONS = new Set([
  "flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "opus", "wav", "webm",
]);

/** What we let a user upload. The extras are transcoded before transcription. */
export const ACCEPTED_EXTENSIONS = new Set([
  ...PROVIDER_NATIVE_EXTENSIONS,
  "mkv", "mov", "avi", "wmv", "m4v", "3gp", "mts", "m2ts", "aac", "wma", "amr", "caf", "aiff", "aif",
]);

/** For the file picker's accept attribute. */
export const ACCEPT_ATTRIBUTE = [
  "audio/*",
  "video/*",
  ...[...ACCEPTED_EXTENSIONS].map((ext) => `.${ext}`),
].join(",");

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export function isAcceptedUpload(filename: string): boolean {
  const ext = extensionOf(filename);
  return ext.length > 0 && ACCEPTED_EXTENSIONS.has(ext);
}

export function needsTranscode(filename: string, sizeBytes: number, maxBytes: number): boolean {
  return !PROVIDER_NATIVE_EXTENSIONS.has(extensionOf(filename)) || sizeBytes > maxBytes;
}

export function supportedFormatsMessage(): string {
  return `Supported formats: ${[...ACCEPTED_EXTENSIONS].sort().join(", ")}.`;
}
