"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const STEPS = [
  { status: "QUEUED", label: "Uploading media" },
  { status: "TRANSCRIBING", label: "Transcribing with speaker labels" },
  { status: "SUMMARIZING", label: "Writing summary and action items" },
] as const;

const ORDER = ["UPLOADING", "QUEUED", "TRANSCRIBING", "SUMMARIZING", "READY"];

/**
 * Drives the pipeline from the client while a meeting is processing.
 * In production a provider webhook calls the same `advance` endpoint; polling
 * keeps local development working without a public URL.
 */
export function ProcessingView({
  meetingId,
  initialStatus,
  initialError,
}: {
  meetingId: string;
  initialStatus: string;
  initialError: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState(initialError);
  const inFlight = useRef(false);

  useEffect(() => {
    if (status === "READY" || status === "FAILED") return;

    let cancelled = false;

    async function tick() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetch(`/api/meetings/${meetingId}/advance`, { method: "POST" });
        if (!res.ok) return;
        const data = (await res.json()) as { status: string; error: string | null };
        if (cancelled) return;
        setStatus(data.status);
        setError(data.error);
        if (data.status === "READY") router.refresh();
      } finally {
        inFlight.current = false;
      }
    }

    void tick();
    const timer = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [meetingId, status, router]);

  if (status === "FAILED") {
    return (
      <Card>
        <CardBody className="space-y-4 py-10 text-center">
          <TriangleAlert className="mx-auto h-6 w-6 text-danger" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium">Processing failed</p>
            <p className="text-sm text-muted">{error ?? "Something went wrong."}</p>
          </div>
          <Button variant="secondary" onClick={() => router.push("/meetings")}>
            Back to meetings
          </Button>
        </CardBody>
      </Card>
    );
  }

  const currentIndex = ORDER.indexOf(status);

  return (
    <Card>
      <CardBody className="space-y-6 py-10">
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium">Working on this meeting</p>
          <p className="text-sm text-muted">
            Transcription usually takes a fraction of the recording&rsquo;s length. This
            page updates itself.
          </p>
        </div>

        <ol className="mx-auto max-w-sm space-y-3">
          {STEPS.map((step) => {
            const index = ORDER.indexOf(step.status);
            const done = currentIndex > index;
            const active = currentIndex === index;
            return (
              <li
                key={step.status}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm",
                  active && "border-primary bg-primary-soft",
                  !active && !done && "text-muted",
                )}
              >
                {done ? (
                  <Check className="h-4 w-4 text-success" aria-hidden />
                ) : active ? (
                  <Spinner className="h-4 w-4 text-primary" />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-border" />
                )}
                {step.label}
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}
