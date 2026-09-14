import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";
import { storageDriver, writeLocalObject } from "@/lib/storage";

// Local-disk upload endpoint. With STORAGE_DRIVER=r2 the browser PUTs straight
// to R2 instead and never hits this route.
export async function POST(req: Request) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (storageDriver !== "local") {
    return NextResponse.json({ error: "Local uploads are disabled" }, { status: 400 });
  }

  const key = req.headers.get("x-storage-key");
  if (!key) return NextResponse.json({ error: "Missing x-storage-key" }, { status: 400 });

  // the key is derived from a meeting id — make sure it is this user's meeting
  const meetingId = key.split("/")[1];
  const meeting = await db.meeting.findFirst({
    where: { id: meetingId, userId: user.id, storageKey: key },
    select: { id: true },
  });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!req.body) return NextResponse.json({ error: "Empty body" }, { status: 400 });
  const { size } = await writeLocalObject(key, req.body);

  return NextResponse.json({ ok: true, size });
}
