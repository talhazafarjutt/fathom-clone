import Link from "next/link";
import { Suspense } from "react";
import { Clock, FileAudio } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { IN_PROGRESS, StatusBadge } from "@/components/meeting/status-badge";
import { NewMeeting } from "@/components/new-meeting";
import { SearchBox } from "@/components/search-box";
import { Card, CardBody } from "@/components/ui/card";
import { db } from "@/lib/db";
import { searchMeetings } from "@/lib/search";
import { requireUser } from "@/lib/session";
import { formatTimestamp } from "@/lib/transcript";
import { formatDuration } from "@/lib/utils";

export const metadata = { title: "Meetings — Cadence" };

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const [meetings, hits] = await Promise.all([
    db.meeting.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        summary: { select: { tldr: true } },
        _count: { select: { actionItems: true } },
      },
      take: 50,
    }),
    query ? searchMeetings(user.id, query) : Promise.resolve([]),
  ]);

  const processing = meetings.some((m) => IN_PROGRESS.includes(m.status));

  return (
    <div className="space-y-8">
      {processing && <AutoRefresh />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Meetings</h1>
          <p className="text-sm text-muted">
            {meetings.length} {meetings.length === 1 ? "recording" : "recordings"}
          </p>
        </div>
        <Suspense>
          <SearchBox />
        </Suspense>
      </div>

      <NewMeeting />

      {query ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">
            {hits.length} {hits.length === 1 ? "result" : "results"} for &ldquo;{query}
            &rdquo;
          </h2>
          {hits.length === 0 && (
            <p className="text-sm text-muted">
              Nothing matched. Search covers meeting titles and every word spoken.
            </p>
          )}
          {hits.map((hit) => (
            <Link
              key={hit.id}
              href={
                hit.startMs !== null
                  ? `/meetings/${hit.id}?t=${Math.floor(hit.startMs / 1000)}`
                  : `/meetings/${hit.id}`
              }
              className="block"
            >
              <Card className="transition-colors hover:border-primary">
                <CardBody className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{hit.title}</span>
                    <StatusBadge status={hit.status} />
                  </div>
                  {hit.snippet && (
                    <p
                      className="text-sm text-muted [&_mark]:rounded [&_mark]:bg-primary-soft [&_mark]:px-0.5 [&_mark]:text-primary"
                      // ts_headline escapes the source text and injects only the
                      // <mark> tags we asked for
                      dangerouslySetInnerHTML={{ __html: hit.snippet }}
                    />
                  )}
                  {hit.startMs !== null && (
                    <span className="font-mono text-xs text-primary">
                      {formatTimestamp(hit.startMs)}
                    </span>
                  )}
                </CardBody>
              </Card>
            </Link>
          ))}
        </section>
      ) : (
        <section className="space-y-3">
          {meetings.length === 0 && (
            <Card>
              <CardBody className="py-12 text-center text-sm text-muted">
                No meetings yet. Upload a recording above to see what this does.
              </CardBody>
            </Card>
          )}
          {meetings.map((meeting) => (
            <Link key={meeting.id} href={`/meetings/${meeting.id}`} className="block">
              <Card className="transition-colors hover:border-primary">
                <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">{meeting.title}</p>
                    <p className="line-clamp-1 text-sm text-muted">
                      {meeting.summary?.tldr ??
                        (meeting.status === "FAILED"
                          ? (meeting.error ?? "Processing failed")
                          : "Processing…")}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden />
                        {formatDuration(meeting.durationSec)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <FileAudio className="h-3 w-3" aria-hidden />
                        {meeting.source === "RECORDING" ? "Recorded" : "Uploaded"}
                      </span>
                      {meeting._count.actionItems > 0 && (
                        <span>{meeting._count.actionItems} action items</span>
                      )}
                      <span>{meeting.createdAt.toLocaleDateString()}</span>
                    </div>
                  </div>
                  <StatusBadge status={meeting.status} />
                </CardBody>
              </Card>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
