export type SegmentLike = {
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
};

export function formatTimestamp(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

export function speakerName(
  speaker: string,
  names: Record<string, string> | null | undefined,
) {
  return names?.[speaker] || `Speaker ${speaker}`;
}

/**
 * Transcript rendered for the LLM. Timestamps are included so the model can
 * cite them back to us — that is what powers "jump to this moment".
 */
export function renderTranscript(
  segments: SegmentLike[],
  names?: Record<string, string> | null,
) {
  return segments
    .map(
      (s) =>
        `[${formatTimestamp(s.startMs)}] ${speakerName(s.speaker, names)}: ${s.text}`,
    )
    .join("\n");
}

/** "1:23" | "01:02:03" -> milliseconds. Returns null for unparseable input. */
export function parseTimestamp(value: string): number | null {
  const parts = value.trim().split(":").map((p) => Number(p));
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return null;
}
