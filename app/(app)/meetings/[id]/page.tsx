import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MeetingHeader } from "@/components/meeting/meeting-header";
import { MeetingWorkspace } from "@/components/meeting/meeting-workspace";
import { ProcessingView } from "@/components/meeting/processing-view";
import { loadMeetingView } from "@/lib/meeting-view";
import { requireUser } from "@/lib/session";

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { t } = await searchParams;

  const data = await loadMeetingView({ id, userId: user.id });
  if (!data) notFound();

  const { meeting } = data;
  const startAtSec = t ? Number(t) : undefined;

  return (
    <div className="space-y-6">
      <Link
        href="/meetings"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All meetings
      </Link>

      <MeetingHeader
        meetingId={meeting.id}
        title={meeting.title}
        status={meeting.status}
        durationSec={meeting.durationSec}
        createdAt={meeting.createdAt.toISOString()}
        shareToken={meeting.shareToken}
      />

      {meeting.status === "READY" ? (
        <MeetingWorkspace
          meetingId={meeting.id}
          playbackUrl={data.playbackUrl}
          segments={data.segments}
          speakerNames={data.speakerNames}
          summary={data.summary}
          actionItems={data.actionItems}
          chatMessages={data.chatMessages}
          durationSec={meeting.durationSec}
          startAtSec={Number.isFinite(startAtSec) ? startAtSec : undefined}
        />
      ) : (
        <ProcessingView
          meetingId={meeting.id}
          initialStatus={meeting.status}
          initialError={meeting.error}
        />
      )}
    </div>
  );
}
