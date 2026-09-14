import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { advanceMeeting } from "@/lib/pipeline";
import { requireUserApi } from "@/lib/session";

// A pipeline step may call a transcription or summarization provider.
export const maxDuration = 300;

/**
 * Drives the pipeline one step and reports status. The meeting page polls this
 * while a meeting is processing; a webhook would call the same code path.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const meeting = await db.meeting.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true },
  });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const terminal = meeting.status === "READY" || meeting.status === "FAILED";
  const status = terminal ? meeting.status : await advanceMeeting(id);

  const fresh = await db.meeting.findUnique({
    where: { id },
    select: { status: true, error: true },
  });
  return NextResponse.json({ status: fresh?.status ?? status, error: fresh?.error ?? null });
}
