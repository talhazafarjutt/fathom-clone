import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageDriver = "local" | "r2";

export const storageDriver: StorageDriver =
  process.env.STORAGE_DRIVER === "r2" ? "r2" : "local";

const LOCAL_ROOT = path.join(process.cwd(), "uploads");

/**
 * Upload instructions handed to the browser.
 *  - `direct`: browser PUTs straight to R2 (bypasses the serverless body limit)
 *  - `post`:   browser POSTs multipart to our own route (local dev only)
 */
export type UploadTarget =
  | { mode: "direct"; url: string; key: string }
  | { mode: "post"; url: string; key: string };

let s3: S3Client | null = null;

function r2() {
  if (!s3) {
    const accountId = required("R2_ACCOUNT_ID");
    s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: required("R2_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return s3;
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} (STORAGE_DRIVER=r2)`);
  return value;
}

export function buildKey(meetingId: string, filename: string) {
  const ext = path.extname(filename).toLowerCase().slice(0, 10) || ".webm";
  return `meetings/${meetingId}/source${ext}`;
}

export async function createUploadTarget(
  key: string,
  contentType: string,
): Promise<UploadTarget> {
  if (storageDriver === "local") {
    return { mode: "post", url: "/api/upload", key };
  }
  const url = await getSignedUrl(
    r2(),
    new PutObjectCommand({
      Bucket: required("R2_BUCKET"),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 60 * 60 },
  );
  return { mode: "direct", url, key };
}

export async function writeLocalObject(key: string, body: ReadableStream | Readable) {
  const dest = path.join(LOCAL_ROOT, key);
  await mkdir(path.dirname(dest), { recursive: true });
  const source = body instanceof Readable ? body : Readable.fromWeb(body as never);
  await pipeline(source, createWriteStream(dest));
  const { size } = await stat(dest);
  return { size };
}

export function localObjectPath(key: string) {
  return path.join(LOCAL_ROOT, key);
}

/**
 * A URL the *transcription provider* can fetch. Local driver has no public
 * URL, so callers fall back to streaming the bytes to the provider instead.
 */
export async function getProviderReadUrl(key: string): Promise<string | null> {
  if (storageDriver === "local") return null;
  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: required("R2_BUCKET"), Key: key }),
    { expiresIn: 60 * 60 * 6 },
  );
}

/** A URL the browser can use in an <audio>/<video> element. */
export async function getPlaybackUrl(key: string): Promise<string> {
  if (storageDriver === "local") {
    return `/api/media/${key}`;
  }
  const publicBase = process.env.R2_PUBLIC_BASE_URL;
  if (publicBase) return `${publicBase.replace(/\/$/, "")}/${key}`;
  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: required("R2_BUCKET"), Key: key }),
    { expiresIn: 60 * 60 * 6 },
  );
}
