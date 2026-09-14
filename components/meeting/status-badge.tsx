import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

const LABELS: Record<string, { label: string; tone: "neutral" | "primary" | "success" | "danger" }> = {
  UPLOADING: { label: "Uploading", tone: "neutral" },
  QUEUED: { label: "Queued", tone: "neutral" },
  TRANSCRIBING: { label: "Transcribing", tone: "primary" },
  SUMMARIZING: { label: "Summarizing", tone: "primary" },
  READY: { label: "Ready", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
};

export const IN_PROGRESS = ["UPLOADING", "QUEUED", "TRANSCRIBING", "SUMMARIZING"];

export function StatusBadge({ status }: { status: string }) {
  const meta = LABELS[status] ?? { label: status, tone: "neutral" as const };
  const busy = IN_PROGRESS.includes(status);

  return (
    <Badge tone={meta.tone}>
      {busy && <Spinner className="h-3 w-3" />}
      {meta.label}
    </Badge>
  );
}
