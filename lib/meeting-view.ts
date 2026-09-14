import { db } from "@/lib/db";
import { getPlaybackUrl } from "@/lib/storage";
import type {
  ActionItemView,
  ChatMessageView,
  CitationView,
  QuestionView,
  SegmentView,
  SummaryView,
  TopicView,
} from "@/lib/types";

/**
 * Loads everything the meeting workspace needs and flattens Prisma's Json
 * columns into typed, serializable view models.
 */
export async function loadMeetingView(where: { id: string; userId: string } | { shareToken: string }) {
  const meeting = await db.meeting.findFirst({
    where,
    include: {
      segments: { orderBy: { idx: "asc" } },
      summary: true,
      actionItems: { orderBy: { idx: "asc" } },
      messages: { orderBy: { createdAt: "asc" }, take: 50 },
    },
  });
  if (!meeting) return null;

  const segments: SegmentView[] = meeting.segments.map((s) => ({
    id: s.id,
    idx: s.idx,
    speaker: s.speaker,
    startMs: s.startMs,
    endMs: s.endMs,
    text: s.text,
  }));

  const summary: SummaryView = meeting.summary
    ? {
        tldr: meeting.summary.tldr,
        bullets: meeting.summary.bullets,
        topics: (meeting.summary.topics as unknown as TopicView[]) ?? [],
        questions: (meeting.summary.questions as unknown as QuestionView[]) ?? [],
        keywords: meeting.summary.keywords,
      }
    : null;

  const actionItems: ActionItemView[] = meeting.actionItems.map((a) => ({
    id: a.id,
    text: a.text,
    assignee: a.assignee,
    dueDate: a.dueDate,
    startMs: a.startMs,
    done: a.done,
  }));

  const chatMessages: ChatMessageView[] = meeting.messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    citations: (m.citations as unknown as CitationView[]) ?? [],
  }));

  const playbackUrl = meeting.storageKey ? await getPlaybackUrl(meeting.storageKey) : "";

  return {
    meeting,
    segments,
    summary,
    actionItems,
    chatMessages,
    playbackUrl,
    speakerNames: (meeting.speakerNames as Record<string, string>) ?? {},
  };
}
