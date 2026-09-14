"use client";

import { useState } from "react";
import { formatTimestamp } from "@/lib/transcript";
import type { ActionItemView } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ActionItemsPane({
  items,
  onSeek,
  readOnly,
}: {
  items: ActionItemView[];
  onSeek: (ms: number) => void;
  readOnly?: boolean;
}) {
  const [state, setState] = useState(items);

  async function toggle(id: string, done: boolean) {
    // optimistic — the checkbox should never feel laggy
    setState((prev) => prev.map((i) => (i.id === id ? { ...i, done } : i)));
    const res = await fetch(`/api/action-items/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done }),
    });
    if (!res.ok) {
      setState((prev) => prev.map((i) => (i.id === id ? { ...i, done: !done } : i)));
    }
  }

  if (state.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-muted">
        No commitments were made in this meeting.
      </p>
    );
  }

  return (
    <ul className="scroll-thin max-h-[60vh] divide-y divide-border overflow-y-auto">
      {state.map((item) => (
        <li key={item.id} className="flex gap-3 px-5 py-3">
          <input
            type="checkbox"
            checked={item.done}
            disabled={readOnly}
            onChange={(e) => toggle(item.id, e.target.checked)}
            className="mt-1 h-4 w-4 accent-[var(--primary)]"
            aria-label={`Mark "${item.text}" as done`}
          />
          <div className="min-w-0 space-y-1">
            <p className={cn("text-sm", item.done && "text-muted line-through")}>
              {item.text}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
              {item.assignee && <span>Owner: {item.assignee}</span>}
              {item.dueDate && <span>Due: {item.dueDate}</span>}
              {item.startMs !== null && (
                <button
                  type="button"
                  onClick={() => onSeek(item.startMs as number)}
                  className="font-mono text-primary hover:underline"
                >
                  {formatTimestamp(item.startMs)}
                </button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
