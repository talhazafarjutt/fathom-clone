import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { advanceMeeting } from "@/lib/pipeline";
import { requireUserApi } from "@/lib/session";

/** Called once the bytes are in storage: flips UPLOADING -> QUEUED and starts work. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const updated = await db.meeting.updateMany({
    where: { id, userId: user.id, status: "UPLOADING" },
    data: { status: "QUEUED" },
  });
  if (updated.count === 0) {
    const exists = await db.meeting.findFirst({ where: { id, userId: user.id } });
    if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const status = await advanceMeeting(id);
  return NextResponse.json({ status });
}
