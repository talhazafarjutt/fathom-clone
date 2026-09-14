"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

export type RecordingResult = { blob: Blob; mimeType: string; durationSec: number };

/**
 * Captures the meeting from the browser: microphone plus, when the user shares a
 * tab or window, that tab's audio — the two are mixed into one track so both
 * sides of the call end up in a single file.
 */
export function Recorder({
  onComplete,
  disabled,
}: {
  onComplete: (result: RecordingResult) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const contextRef = useRef<AudioContext | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [recording]);

  function cleanup() {
    for (const stream of streamsRef.current) {
      for (const track of stream.getTracks()) track.stop();
    }
    streamsRef.current = [];
    contextRef.current?.close().catch(() => {});
    contextRef.current = null;
  }

  async function start() {
    setError(null);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamsRef.current.push(mic);

      // Optional: tab/window audio. Denying it just records the mic.
      let shared: MediaStream | null = null;
      try {
        shared = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        streamsRef.current.push(shared);
        if (shared.getAudioTracks().length === 0) shared = null;
      } catch {
        shared = null;
      }

      const context = new AudioContext();
      contextRef.current = context;
      const destination = context.createMediaStreamDestination();
      context.createMediaStreamSource(mic).connect(destination);
      if (shared) context.createMediaStreamSource(shared).connect(destination);

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(destination.stream, { mimeType });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const durationSec = Math.round((Date.now() - startedAtRef.current) / 1000);
        cleanup();
        setRecording(false);
        setElapsed(0);
        onComplete({ blob: new Blob(chunks, { type: mimeType }), mimeType, durationSec });
      };

      // stop when the user ends the screen share from the browser chrome
      shared?.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorder.state === "recording") recorder.stop();
      });

      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start(1000);
      setRecording(true);
    } catch {
      cleanup();
      setError("Microphone access is required to record.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        type="button"
        variant={recording ? "danger" : "secondary"}
        onClick={recording ? stop : start}
        disabled={disabled}
      >
        {recording ? (
          <>
            <Square className="h-4 w-4" aria-hidden />
            Stop — {formatElapsed(elapsed)}
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" aria-hidden />
            Record a call
          </>
        )}
      </Button>
      {recording && (
        <p className="text-xs text-muted">
          Share the meeting tab (with &ldquo;share tab audio&rdquo;) to capture both sides.
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "audio/webm";
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
