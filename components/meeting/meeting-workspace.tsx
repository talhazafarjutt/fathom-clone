"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionItemsPane } from "@/components/meeting/action-items-pane";
import { ChatPane } from "@/components/meeting/chat-pane";
import { Player } from "@/components/meeting/player";
import { SummaryPane } from "@/components/meeting/summary-pane";
import { TranscriptPane } from "@/components/meeting/transcript-pane";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ActionItemView,
  ChatMessageView,
  SegmentView,
  SummaryView,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "summary" | "actions" | "chat";

export function MeetingWorkspace({
  meetingId,
  playbackUrl,
  segments,
  speakerNames,
  summary,
  actionItems,
  chatMessages,
  durationSec,
  startAtSec,
  readOnly = false,
}: {
  meetingId: string;
  playbackUrl: string;
  segments: SegmentView[];
  speakerNames: Record<string, string>;
  summary: SummaryView;
  actionItems: ActionItemView[];
  chatMessages: ChatMessageView[];
  durationSec: number | null;
  startAtSec?: number;
  readOnly?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentMs, setCurrentMs] = useState((startAtSec ?? 0) * 1000);
  const [durationMs, setDurationMs] = useState((durationSec ?? 0) * 1000);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [follow, setFollow] = useState(true);
  const [tab, setTab] = useState<Tab>(readOnly ? "summary" : "summary");

  const seek = useCallback((ms: number) => {
    const audio = audioRef.current;
    setCurrentMs(ms);
    if (!audio) return;
    audio.currentTime = ms / 1000;
    void audio.play().catch(() => {});
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !startAtSec) return;
    const apply = () => {
      audio.currentTime = startAtSec;
    };
    if (audio.readyState >= 1) apply();
    else audio.addEventListener("loadedmetadata", apply, { once: true });
  }, [startAtSec]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
  }, [rate]);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "summary", label: "Summary" },
    { id: "actions", label: "Action items", count: actionItems.length },
    ...(readOnly ? [] : [{ id: "chat" as const, label: "Ask" }]),
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <Card className="overflow-hidden">
        <audio
          ref={audioRef}
          src={playbackUrl}
          preload="metadata"
          onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
          onLoadedMetadata={(e) => {
            const value = e.currentTarget.duration;
            if (Number.isFinite(value) && value > 0) setDurationMs(value * 1000);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="hidden"
        />

        <Player
          playing={playing}
          currentMs={currentMs}
          durationMs={durationMs}
          rate={rate}
          onToggle={() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (audio.paused) void audio.play().catch(() => {});
            else audio.pause();
          }}
          onSeek={seek}
          onRate={setRate}
        />

        <div className="flex items-center justify-between px-4 py-2 text-xs text-muted">
          <span>{segments.length} segments</span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={follow}
              onChange={(e) => setFollow(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--primary)]"
            />
            Follow along
          </label>
        </div>

        <TranscriptPane
          segments={segments}
          speakerNames={speakerNames}
          currentMs={currentMs}
          onSeek={seek}
          follow={follow}
        />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex items-center gap-1 py-2">
          <CardTitle className="sr-only">Meeting insights</CardTitle>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                tab === item.id
                  ? "bg-primary-soft text-primary"
                  : "text-muted hover:bg-surface-muted",
              )}
            >
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span className="ml-1.5 text-xs">{item.count}</span>
              )}
            </button>
          ))}
        </CardHeader>

        {tab === "summary" && <SummaryPane summary={summary} onSeek={seek} />}
        {tab === "actions" && (
          <ActionItemsPane items={actionItems} onSeek={seek} readOnly={readOnly} />
        )}
        {tab === "chat" && !readOnly && (
          <ChatPane meetingId={meetingId} initialMessages={chatMessages} onSeek={seek} />
        )}
      </Card>
    </div>
  );
}
