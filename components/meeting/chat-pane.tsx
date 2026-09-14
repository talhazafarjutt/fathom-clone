"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { parseTimestamp } from "@/lib/transcript";
import type { ChatMessageView } from "@/lib/types";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "What did we decide?",
  "What are the open risks?",
  "Summarise what each person committed to",
];

export function ChatPane({
  meetingId,
  initialMessages,
  onSeek,
}: {
  meetingId: string;
  initialMessages: ChatMessageView[];
  onSeek: (ms: number) => void;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || streaming) return;

    setDraft("");
    setError(null);
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { id: `local-user-${Date.now()}`, role: "USER", content: trimmed, citations: [] },
      { id: "streaming", role: "ASSISTANT", content: "", citations: [] },
    ]);

    try {
      const res = await fetch(`/api/meetings/${meetingId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      if (!res.ok || !res.body) throw new Error("The assistant could not answer that");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === "streaming" ? { ...m, content: answer } : m)),
        );
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === "streaming" ? { ...m, id: `assistant-${Date.now()}` } : m,
        ),
      );
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== "streaming"));
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex max-h-[60vh] flex-col">
      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Ask anything about this call. Answers cite timestamps — click one to jump to
              that moment.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => ask(suggestion)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-surface-muted"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
              message.role === "USER"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-surface-muted",
            )}
          >
            {message.role === "ASSISTANT" ? (
              <AnswerText text={message.content} onSeek={onSeek} streaming={message.id === "streaming"} />
            ) : (
              message.content
            )}
          </div>
        ))}

        {error && <p className="text-sm text-danger">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-border px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
      >
        <Textarea
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(draft);
            }
          }}
          placeholder="Ask about this meeting…"
          disabled={streaming}
        />
        <Button type="submit" size="icon" disabled={streaming || draft.trim().length === 0}>
          <SendHorizonal className="h-4 w-4" aria-hidden />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}

/** Renders the answer and turns every [m:ss] marker into a seek button. */
function AnswerText({
  text,
  onSeek,
  streaming,
}: {
  text: string;
  onSeek: (ms: number) => void;
  streaming: boolean;
}) {
  if (!text) {
    return <span className="text-muted">{streaming ? "Thinking…" : ""}</span>;
  }

  const parts = text.split(/(\[\d{1,2}:\d{2}(?::\d{2})?\])/g);

  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, index) => {
        const match = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]$/.exec(part);
        if (!match) return <Fragment key={index}>{part}</Fragment>;
        const ms = parseTimestamp(match[1]);
        if (ms === null) return <Fragment key={index}>{part}</Fragment>;
        return (
          <button
            key={index}
            type="button"
            onClick={() => onSeek(ms)}
            className="mx-0.5 rounded bg-primary-soft px-1 font-mono text-xs text-primary hover:underline"
          >
            {match[1]}
          </button>
        );
      })}
    </span>
  );
}
