import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { localObjectPath, storageDriver } from "@/lib/storage";

/**
 * Serves locally-stored media with HTTP range support so the <audio> element can
 * seek. Only used by STORAGE_DRIVER=local; R2 serves its own bytes.
 */
export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  if (storageDriver !== "local") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  if (parts.some((p) => p === ".." || p.includes("\\"))) {
    return NextResponse.json({ error: "Bad key" }, { status: 400 });
  }

  const filePath = localObjectPath(key);
  const root = path.join(process.cwd(), "uploads");
  if (!path.resolve(filePath).startsWith(path.resolve(root) + path.sep)) {
    return NextResponse.json({ error: "Bad key" }, { status: 400 });
  }

  const meeting = await db.meeting.findFirst({
    where: { OR: [{ storageKey: key }, { audioKey: key }] },
    select: { userId: true, shareToken: true, mimeType: true, audioKey: true },
  });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!meeting.shareToken) {
    const session = await getSession();
    if (session?.user.id !== meeting.userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  let size: number;
  try {
    ({ size } = await stat(filePath));
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentType =
    meeting.audioKey === key ? "audio/mpeg" : meeting.mimeType || "application/octet-stream";
  const range = req.headers.get("range");

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (Number.isNaN(start) || start >= size || start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: { "content-range": `bytes */${size}` },
      });
    }
    const stream = Readable.toWeb(
      createReadStream(filePath, { start, end }),
    ) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      status: 206,
      headers: {
        "content-type": contentType,
        "content-length": String(end - start + 1),
        "content-range": `bytes ${start}-${end}/${size}`,
        "accept-ranges": "bytes",
        "cache-control": "private, max-age=3600",
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    headers: {
      "content-type": contentType,
      "content-length": String(size),
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=3600",
    },
  });
}
