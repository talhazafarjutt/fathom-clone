import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";
import { isAcceptedUpload, supportedFormatsMessage } from "@/lib/media";
import { buildKey, createUploadTarget } from "@/lib/storage";

const CreateSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(2 * 1024 * 1024 * 1024),
  source: z.enum(["UPLOAD", "RECORDING"]).default("UPLOAD"),
  title: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  const { filename, contentType, sizeBytes, source, title } = parsed.data;

  // Reject formats we cannot handle before a large file is uploaded and stored,
  // rather than failing at the transcription provider minutes later.
  if (!isAcceptedUpload(filename)) {
    return NextResponse.json(
      { error: `That file type is not supported. ${supportedFormatsMessage()}` },
      { status: 415 },
    );
  }

  const meeting = await db.meeting.create({
    data: {
      userId: user.id,
      title: title?.trim() || defaultTitle(filename, source),
      source,
      mimeType: contentType,
      sizeBytes,
      status: "UPLOADING",
    },
  });

  const key = buildKey(meeting.id, filename);
  await db.meeting.update({ where: { id: meeting.id }, data: { storageKey: key } });

  const upload = await createUploadTarget(key, contentType);
  return NextResponse.json({ meetingId: meeting.id, upload });
}

function defaultTitle(filename: string, source: string) {
  if (source === "RECORDING") {
    return `Recording — ${new Date().toLocaleString()}`;
  }
  return filename.replace(/\.[^.]+$/, "").slice(0, 120) || "Untitled meeting";
}
