"use client";

import { Pause, Play, Rewind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/transcript";

const RATES = [1, 1.25, 1.5, 2];

export function Player({
  playing,
  currentMs,
  durationMs,
  rate,
  onToggle,
  onSeek,
  onRate,
}: {
  playing: boolean;
  currentMs: number;
  durationMs: number;
  rate: number;
  onToggle: () => void;
  onSeek: (ms: number) => void;
  onRate: (rate: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
      <Button size="icon" onClick={onToggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? (
          <Pause className="h-4 w-4" aria-hidden />
        ) : (
          <Play className="h-4 w-4" aria-hidden />
        )}
      </Button>

      <Button
        size="icon"
        variant="secondary"
        onClick={() => onSeek(Math.max(0, currentMs - 10_000))}
        aria-label="Back 10 seconds"
      >
        <Rewind className="h-4 w-4" aria-hidden />
      </Button>

      <span className="font-mono text-xs tabular-nums text-muted">
        {formatTimestamp(currentMs)} / {formatTimestamp(durationMs)}
      </span>

      <input
        type="range"
        min={0}
        max={Math.max(durationMs, 1)}
        value={Math.min(currentMs, durationMs)}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="Seek"
        className="h-1 min-w-[8rem] flex-1 cursor-pointer accent-[var(--primary)]"
      />

      <select
        value={rate}
        onChange={(e) => onRate(Number(e.target.value))}
        aria-label="Playback speed"
        className="h-8 rounded-lg border border-border bg-surface px-2 text-xs"
      >
        {RATES.map((option) => (
          <option key={option} value={option}>
            {option}×
          </option>
        ))}
      </select>
    </div>
  );
}
