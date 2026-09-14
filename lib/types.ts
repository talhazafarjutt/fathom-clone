/** Plain, serializable shapes handed from server components to client components. */

export type SegmentView = {
  id: string;
  idx: number;
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type TopicView = { title: string; summary: string; startMs: number | null };

export type QuestionView = { question: string; answer: string; startMs: number | null };

export type SummaryView = {
  tldr: string;
  bullets: string[];
  topics: TopicView[];
  questions: QuestionView[];
  keywords: string[];
} | null;

export type ActionItemView = {
  id: string;
  text: string;
  assignee: string | null;
  dueDate: string | null;
  startMs: number | null;
  done: boolean;
};

export type CitationView = { startMs: number; label: string };

export type ChatMessageView = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citations: CitationView[];
};
