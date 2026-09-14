"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, Link2, Link2Off, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/meeting/status-badge";
import { formatDuration } from "@/lib/utils";

export function MeetingHeader({
  meetingId,
  title,
  status,
  durationSec,
  createdAt,
  shareToken,
}: {
  meetingId: string;
  title: string;
  status: string;
  durationSec: number | null;
  createdAt: string;
  shareToken: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [token, setToken] = useState(shareToken);
  const [copied, setCopied] = useState(false);

  async function saveTitle() {
    const next = value.trim();
    setEditing(false);
    if (!next || next === title) {
      setValue(title);
      return;
    }
    await fetch(`/api/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    router.refresh();
  }

  async function toggleShare() {
    const res = await fetch(`/api/meetings/${meetingId}/share`, { method: "POST" });
    if (!res.ok) return;
    const data = (await res.json()) as { shareToken: string | null };
    setToken(data.shareToken);
    if (data.shareToken) void copyLink(data.shareToken);
  }

  async function copyLink(value: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${value}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is still visible below */
    }
  }

  async function remove() {
    if (!window.confirm("Delete this meeting and its transcript?")) return;
    await fetch(`/api/meetings/${meetingId}`, { method: "DELETE" });
    router.push("/meetings");
    router.refresh();
  }

  return (
    <header className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          {editing ? (
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveTitle();
                if (e.key === "Escape") {
                  setValue(title);
                  setEditing(false);
                }
              }}
              className="text-lg font-semibold"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="group flex items-center gap-2 text-left"
            >
              <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
              <Pencil
                className="h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
            </button>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <StatusBadge status={status} />
            <span>{formatDuration(durationSec)}</span>
            <span>{new Date(createdAt).toLocaleString()}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={toggleShare}>
            {token ? (
              <Link2Off className="h-4 w-4" aria-hidden />
            ) : (
              <Link2 className="h-4 w-4" aria-hidden />
            )}
            {token ? "Unshare" : "Share"}
          </Button>
          <Button variant="danger" size="sm" onClick={remove}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete
          </Button>
        </div>
      </div>

      {token && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-xs text-muted">
            /share/{token}
          </code>
          <Button variant="ghost" size="sm" onClick={() => copyLink(token)}>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}
    </header>
  );
}
