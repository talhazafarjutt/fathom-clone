"use client";

import { useEffect, useRef } from "react";
import { formatTimestamp, speakerName } from "@/lib/transcript";
import type { SegmentView } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TranscriptPane({
  segments,
  speakerNames,
  currentMs,
  onSeek,
  follow,
}: {
  segments: SegmentView[];
  speakerNames: Record<string, string>;
  currentMs: number;
  onSeek: (ms: number) => void;
  follow: boolean;
}) {
  const activeId = segments.find(
    (s) => currentMs >= s.startMs && currentMs < s.endMs,
  )?.id;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!follow || !activeId) return;
    const node = containerRef.current?.querySelector(`[data-segment="${activeId}"]`);
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeId, follow]);

  return (
    <div ref={containerRef} className="scroll-thin max-h-[60vh] overflow-y-auto px-2 py-2">
      <ol className="space-y-1">
        {segments.map((segment) => {
          const active = segment.id === activeId;
          return (
            <li key={segment.id} data-segment={segment.id}>
              <button
                type="button"
                onClick={() => onSeek(segment.startMs)}
                className={cn(
                  "group flex w-full gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                  active ? "bg-primary-soft" : "hover:bg-surface-muted",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 pt-0.5 font-mono text-xs tabular-nums",
                    active ? "text-primary" : "text-muted",
                  )}
                >
                  {formatTimestamp(segment.startMs)}
                </span>
                <span className="min-w-0 space-y-0.5">
                  <span className="block text-xs font-semibold">
                    {speakerName(segment.speaker, speakerNames)}
                  </span>
                  <span className="block text-sm leading-relaxed">{segment.text}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
