"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CloudUpload } from "lucide-react";
import { Recorder, type RecordingResult } from "@/components/recorder";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { createAndUpload } from "@/lib/upload-client";
import {
  ACCEPT_ATTRIBUTE,
  isAcceptedUpload,
  supportedFormatsMessage,
} from "@/lib/media";
import { cn } from "@/lib/utils";

export function NewMeeting() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function submit(file: Blob, filename: string, contentType: string, source: "UPLOAD" | "RECORDING") {
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const meetingId = await createAndUpload({
        file,
        filename,
        contentType,
        source,
        onProgress: setProgress,
      });
      router.push(`/meetings/${meetingId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setBusy(false);
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    // Check here too, so a wrong file never starts a multi-megabyte upload.
    if (!isAcceptedUpload(file.name)) {
      setError(`${file.name} is not a supported format. ${supportedFormatsMessage()}`);
      return;
    }
    setError(null);
    void submit(file, file.name, file.type || "application/octet-stream", "UPLOAD");
  }

  function onRecorded({ blob, mimeType }: RecordingResult) {
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    void submit(blob, `recording.${ext}`, mimeType.split(";")[0], "RECORDING");
  }

  return (
    <Card>
      <CardBody>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) onFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex flex-col items-center gap-4 rounded-lg border border-dashed border-border px-6 py-10 text-center transition-colors",
            dragging && "border-primary bg-primary-soft",
          )}
        >
          {busy ? (
            <div className="w-full max-w-sm space-y-3">
              <p className="flex items-center justify-center gap-2 text-sm font-medium">
                <Spinner /> Uploading — {Math.round(progress * 100)}%
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.max(4, progress * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <CloudUpload className="h-7 w-7 text-muted" aria-hidden />
              <div className="space-y-1">
                <p className="text-sm font-medium">Drop an audio or video file</p>
                <p className="text-sm text-muted">
                  mp3, m4a, wav, mp4, webm, mkv, mov — or record the call right here.
                  Video files are converted to audio automatically.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button type="button" onClick={() => inputRef.current?.click()}>
                  Choose file
                </Button>
                <Recorder onComplete={onRecorded} disabled={busy} />
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? undefined)}
              />
            </>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </CardBody>
    </Card>
  );
}
