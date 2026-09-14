import { notFound } from "next/navigation";
import { MeetingWorkspace } from "@/components/meeting/meeting-workspace";
import { Badge } from "@/components/ui/badge";
import { loadMeetingView } from "@/lib/meeting-view";
import { formatDuration } from "@/lib/utils";

export const metadata = { title: "Shared meeting — Cadence" };

/** Public, read-only view. No session required — the token is the credential. */
export default async function SharedMeetingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadMeetingView({ shareToken: token });
  if (!data || data.meeting.status !== "READY") notFound();

  const { meeting } = data;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <span className="text-sm font-semibold tracking-tight">Cadence</span>
          <Badge>Shared read-only</Badge>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-6 py-8">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{meeting.title}</h1>
          <p className="text-sm text-muted">
            {formatDuration(meeting.durationSec)} · {meeting.createdAt.toLocaleDateString()}
          </p>
        </div>

        <MeetingWorkspace
          meetingId={meeting.id}
          playbackUrl={data.playbackUrl}
          segments={data.segments}
          speakerNames={data.speakerNames}
          summary={data.summary}
          actionItems={data.actionItems}
          chatMessages={[]}
          durationSec={meeting.durationSec}
          speakersInferred={meeting.speakersInferred}
          readOnly
        />
      </main>
    </div>
  );
}
