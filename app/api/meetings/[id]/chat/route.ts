import { NextResponse } from "next/server";
import { z } from "zod";
import { extractCitations, streamMeetingAnswer, type ChatTurn } from "@/lib/ai/chat";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";

// The answer is streamed token by token.
export const maxDuration = 120;

const BodySchema = z.object({ question: z.string().min(1).max(2000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const question = parsed.data.question.trim();

  const meeting = await db.meeting.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true, speakerNames: true },
  });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (meeting.status !== "READY") {
    return NextResponse.json({ error: "Meeting is still processing" }, { status: 409 });
  }

  const [segments, history] = await Promise.all([
    db.transcriptSegment.findMany({ where: { meetingId: id }, orderBy: { idx: "asc" } }),
    db.chatMessage.findMany({
      where: { meetingId: id },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
  ]);

  await db.chatMessage.create({
    data: { meetingId: id, role: "USER", content: question },
  });

  const stream = streamMeetingAnswer({
    segments,
    speakerNames: meeting.speakerNames as Record<string, string>,
    history: history.map<ChatTurn>((m) => ({
      role: m.role === "USER" ? "user" : "assistant",
      content: m.content,
    })),
    question,
    onDone: async (full) => {
      await db.chatMessage.create({
        data: {
          meetingId: id,
          role: "ASSISTANT",
          content: full,
          citations: extractCitations(full),
        },
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
