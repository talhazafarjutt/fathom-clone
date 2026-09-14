"use client";

import { formatTimestamp } from "@/lib/transcript";
import type { SummaryView } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export function SummaryPane({
  summary,
  onSeek,
}: {
  summary: SummaryView;
  onSeek: (ms: number) => void;
}) {
  if (!summary) {
    return <p className="px-5 py-6 text-sm text-muted">No summary for this meeting.</p>;
  }

  return (
    <div className="scroll-thin max-h-[60vh] space-y-6 overflow-y-auto px-5 py-5">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">TL;DR</h3>
        <p className="text-sm leading-relaxed">{summary.tldr}</p>
      </section>

      {summary.bullets.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Key points
          </h3>
          <ul className="space-y-1.5">
            {summary.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-2 text-sm leading-relaxed">
                <span aria-hidden className="text-primary">
                  •
                </span>
                {bullet}
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.topics.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Chapters
          </h3>
          <ul className="space-y-3">
            {summary.topics.map((topic) => (
              <li key={`${topic.title}-${topic.startMs}`} className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <TimestampButton startMs={topic.startMs} onSeek={onSeek} />
                  <span className="text-sm font-medium">{topic.title}</span>
                </div>
                <p className="text-sm text-muted">{topic.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.questions.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Questions raised
          </h3>
          <ul className="space-y-3">
            {summary.questions.map((item) => (
              <li key={item.question} className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <TimestampButton startMs={item.startMs} onSeek={onSeek} />
                  <span className="text-sm font-medium">{item.question}</span>
                </div>
                <p className="text-sm text-muted">{item.answer}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.keywords.length > 0 && (
        <section className="flex flex-wrap gap-2">
          {summary.keywords.map((keyword) => (
            <Badge key={keyword}>{keyword}</Badge>
          ))}
        </section>
      )}
    </div>
  );
}

function TimestampButton({
  startMs,
  onSeek,
}: {
  startMs: number | null;
  onSeek: (ms: number) => void;
}) {
  if (startMs === null) return null;
  return (
    <button
      type="button"
      onClick={() => onSeek(startMs)}
      className="shrink-0 font-mono text-xs text-primary hover:underline"
    >
      {formatTimestamp(startMs)}
    </button>
  );
}
