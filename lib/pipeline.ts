import { db } from "@/lib/db";
import { summarizeMeeting } from "@/lib/ai/summarize";
import { fetchTranscription, submitTranscription } from "@/lib/transcribe";
import { parseTimestamp } from "@/lib/transcript";
import type { MeetingStatus } from "@/lib/generated/prisma/enums";

/**
 * The processing pipeline is a state machine driven by repeated calls:
 *
 *   QUEUED -> TRANSCRIBING -> SUMMARIZING -> READY
 *
 * `advanceMeeting` performs at most one transition per call and is safe to call
 * concurrently — every transition is claimed with a conditional update. In dev
 * the client polls it; in production the same function is called from the
 * transcription webhook. No queue infrastructure required.
 */
export async function advanceMeeting(meetingId: string): Promise<MeetingStatus> {
  const meeting = await db.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) throw new Error("Meeting not found");

  try {
    switch (meeting.status) {
      case "QUEUED": {
        if (!meeting.storageKey) throw new Error("Meeting has no uploaded media");
        // claim the transition so two pollers can't both submit
        const claimed = await db.meeting.updateMany({
          where: { id: meetingId, status: "QUEUED" },
          data: { status: "TRANSCRIBING" },
        });
        if (claimed.count === 0) return (await status(meetingId)) ?? "QUEUED";

        try {
          const transcriptId = await submitTranscription(meeting.storageKey);
          await db.meeting.update({
            where: { id: meetingId },
            data: { transcriptId },
          });
        } catch (error) {
          await db.meeting.update({
            where: { id: meetingId },
            data: { status: "QUEUED" },
          });
          throw error;
        }
        return "TRANSCRIBING";
      }

      case "TRANSCRIBING": {
        if (!meeting.transcriptId) {
          // submit crashed between claim and id write — retry from the start
          await db.meeting.update({
            where: { id: meetingId },
            data: { status: "QUEUED" },
          });
          return "QUEUED";
        }

        const result = await fetchTranscription(meeting.transcriptId);
        if (result.status === "processing") return "TRANSCRIBING";
        if (result.status === "error") return fail(meetingId, result.error);
        if (result.utterances.length === 0) {
          return fail(meetingId, "No speech detected in this recording");
        }

        await db.$transaction([
          db.transcriptSegment.deleteMany({ where: { meetingId } }),
          db.transcriptSegment.createMany({
            data: result.utterances.map((u, idx) => ({
              meetingId,
              idx,
              speaker: u.speaker,
              startMs: u.startMs,
              endMs: u.endMs,
              text: u.text,
              confidence: u.confidence,
            })),
          }),
          db.meeting.update({
            where: { id: meetingId },
            data: {
              status: "SUMMARIZING",
              durationSec: result.durationSec ? Math.round(result.durationSec) : null,
            },
          }),
        ]);
        return "SUMMARIZING";
      }

      case "SUMMARIZING": {
        const segments = await db.transcriptSegment.findMany({
          where: { meetingId },
          orderBy: { idx: "asc" },
        });
        if (segments.length === 0) return fail(meetingId, "Transcript is empty");

        const summary = await summarizeMeeting(segments);

        const speakerNames = Object.fromEntries(
          summary.speakers
            .filter((s) => s.name.trim().length > 0)
            .map((s) => [s.speaker, s.name.trim()]),
        );

        await db.$transaction([
          db.summary.deleteMany({ where: { meetingId } }),
          db.actionItem.deleteMany({ where: { meetingId } }),
          db.summary.create({
            data: {
              meetingId,
              tldr: summary.tldr,
              bullets: summary.bullets,
              topics: summary.topics.map((t) => ({
                title: t.title,
                summary: t.summary,
                startMs: parseTimestamp(t.timestamp),
              })),
              questions: summary.questions.map((q) => ({
                question: q.question,
                answer: q.answer,
                startMs: parseTimestamp(q.timestamp),
              })),
              keywords: summary.keywords,
              model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
            },
          }),
          db.actionItem.createMany({
            data: summary.actionItems.map((a, idx) => ({
              meetingId,
              idx,
              text: a.text,
              assignee: a.assignee.trim() || null,
              dueDate: a.dueDate.trim() || null,
              startMs: parseTimestamp(a.timestamp),
            })),
          }),
          db.meeting.update({
            where: { id: meetingId },
            data: {
              status: "READY",
              title: summary.title.trim() || meeting.title,
              speakerNames,
              error: null,
            },
          }),
        ]);
        return "READY";
      }

      default:
        return meeting.status;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed";
    return fail(meetingId, message);
  }
}

async function fail(meetingId: string, error: string): Promise<MeetingStatus> {
  await db.meeting.update({
    where: { id: meetingId },
    data: { status: "FAILED", error: error.slice(0, 500) },
  });
  return "FAILED";
}

async function status(meetingId: string) {
  const m = await db.meeting.findUnique({
    where: { id: meetingId },
    select: { status: true },
  });
  return m?.status ?? null;
}
