#!/usr/bin/env python3
"""
Agent capture hook for the 8x assignment.

Wired to two Claude Code lifecycle events in .claude/settings.json:

  UserPromptSubmit -> capture.py prompt     (appends the verbatim prompt)
  Stop             -> capture.py response   (appends the final assistant text)

Only the prompt and the final response are recorded. Thinking blocks, tool
calls, tool results, and intermediate steps are deliberately dropped.

Also usable manually:

  capture.py backfill <transcript.jsonl>    rebuild a log from a session
                                            transcript (used once, to recover
                                            the turns that happened before the
                                            hook was installed)

Writes to .agent-logs/<YYYY-MM-DD_HH-MM-SS>_<session-id>.md, one file per
session. Never edits or deletes an existing entry.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

AUTHOR = os.environ.get("AGENT_LOG_AUTHOR", "talha-zafar")
PROJECT = "fathom-clone"
TOOL = "claude-code"


def project_dir() -> Path:
    return Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])


def logs_dir() -> Path:
    d = project_dir() / ".agent-logs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def read_transcript(path: str | None) -> list[dict]:
    if not path or not os.path.exists(path):
        return []
    rows = []
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


# Background-task completions and system reminders arrive as user-role messages
# but are not things a human typed. The live UserPromptSubmit hook never fires
# for them, so backfill skips them too, otherwise the two records disagree.
SYSTEM_EVENT_MARKERS = ("<task-notification>", "[SYSTEM NOTIFICATION", "<system-reminder>")


def is_real_prompt(row: dict) -> bool:
    """A human prompt: role=user with plain string content (tool results are lists)."""
    if row.get("type") != "user":
        return False
    if "toolUseResult" in row:
        return False
    content = row.get("message", {}).get("content")
    if not isinstance(content, str) or content.strip() == "":
        return False
    return not any(marker in content for marker in SYSTEM_EVENT_MARKERS)


def assistant_text(row: dict) -> str:
    """Visible response text only — thinking and tool_use blocks are skipped."""
    content = row.get("message", {}).get("content")
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    return "".join(b.get("text", "") for b in content if b.get("type") == "text")


def current_model(rows: list[dict], default: str = "claude-opus-5") -> str:
    for row in reversed(rows):
        if row.get("type") == "assistant":
            model = row.get("message", {}).get("model")
            if model:
                return model
    return default


def log_path(session_id: str, first_ts: str | None = None) -> Path:
    """One file per session; reused for every later entry in that session."""
    existing = sorted(logs_dir().glob(f"*_{session_id}.md"))
    if existing:
        return existing[0]
    stamp = (first_ts or now_iso())[:19].replace(":", "-").replace("T", "_")
    return logs_dir() / f"{stamp}_{session_id}.md"


ENTRY_RE = re.compile(r"^\[LOG_ENTRY type=PROMPT num=(\d+)", re.M)
FRONTMATTER_RE = re.compile(r"\A---\n.*?\n---\n", re.S)


def split_file(path: Path) -> tuple[str, str]:
    if not path.exists():
        return "", ""
    text = path.read_text(encoding="utf-8")
    match = FRONTMATTER_RE.match(text)
    if not match:
        return "", text
    return match.group(0), text[match.end():]


def build_frontmatter(session_id: str, model: str, exchanges: int, first_ts: str, last_ts: str) -> str:
    return (
        "---\n"
        f"session_id: {session_id}\n"
        f"date: {first_ts[:10]}\n"
        f"author: {AUTHOR}\n"
        f"model: {model}\n"
        f"tool: {TOOL}\n"
        f"project: {PROJECT}\n"
        f"total_exchanges: {exchanges}\n"
        f"first_prompt_time: {first_ts}\n"
        f"last_prompt_time: {last_ts}\n"
        "---\n\n"
    )


def append_entry(session_id: str, kind: str, num: int, timestamp: str, model: str, body: str) -> None:
    path = log_path(session_id, timestamp)
    frontmatter, rest = split_file(path)

    short = session_id[:8]
    if not rest.strip():
        rest = (
            f"# Session Log - {timestamp[:10]}\n\n"
            f"Session: `{short}` | Project: `{PROJECT}` | Author: `{AUTHOR}`\n\n"
            "---\n\n"
        )

    rest += (
        f"[LOG_ENTRY type={kind} num={num} session={short}]\n"
        f"timestamp: {timestamp}\n"
        f"model: {model}\n\n"
        f"{body.rstrip()}\n\n\n"
    )

    prompts = ENTRY_RE.findall(rest)
    exchanges = len(prompts)
    first_ts = existing_first_ts(frontmatter) or timestamp
    last_ts = timestamp if kind == "PROMPT" else (existing_last_ts(frontmatter) or timestamp)

    path.write_text(
        build_frontmatter(session_id, model, exchanges, first_ts, last_ts) + rest.lstrip("\n"),
        encoding="utf-8",
    )


def _frontmatter_value(frontmatter: str, key: str) -> str | None:
    match = re.search(rf"^{key}: (.+)$", frontmatter, re.M)
    return match.group(1).strip() if match else None


def existing_first_ts(frontmatter: str) -> str | None:
    return _frontmatter_value(frontmatter, "first_prompt_time")


def existing_last_ts(frontmatter: str) -> str | None:
    return _frontmatter_value(frontmatter, "last_prompt_time")


def next_num(session_id: str, kind: str) -> int:
    path = log_path(session_id)
    if not path.exists():
        return 1
    text = path.read_text(encoding="utf-8")
    return len(re.findall(rf"^\[LOG_ENTRY type={kind} ", text, re.M)) + 1


def handle_prompt(payload: dict) -> None:
    session_id = payload.get("session_id") or "unknown-session"
    rows = read_transcript(payload.get("transcript_path"))

    prompt = payload.get("prompt")
    if not prompt:  # defensive: recover the prompt from the transcript
        prompts = [r for r in rows if is_real_prompt(r)]
        prompt = prompts[-1]["message"]["content"] if prompts else "(prompt unavailable)"

    append_entry(
        session_id,
        "PROMPT",
        next_num(session_id, "PROMPT"),
        now_iso(),
        current_model(rows),
        prompt,
    )


def handle_response(payload: dict) -> None:
    session_id = payload.get("session_id") or "unknown-session"
    rows = read_transcript(payload.get("transcript_path"))
    if not rows:
        return

    # everything the assistant said since the most recent human prompt
    last_prompt_idx = max(
        (i for i, r in enumerate(rows) if is_real_prompt(r)),
        default=-1,
    )
    texts = [
        assistant_text(r)
        for r in rows[last_prompt_idx + 1:]
        if r.get("type") == "assistant"
    ]
    body = "\n\n".join(t.strip() for t in texts if t.strip())
    if not body:
        return

    num = next_num(session_id, "RESPONSE")
    if num > next_num(session_id, "PROMPT") - 1:
        return  # no prompt logged for this response yet; skip rather than mislabel

    append_entry(session_id, "RESPONSE", num, now_iso(), current_model(rows), body)


def rebuild_file(session_id: str, pairs, skip_last_response: bool) -> str:
    """Render the whole session file from the transcript, in order."""
    short = session_id[:8]
    first_ts = pairs[0][0].get("timestamp", now_iso()) if pairs else now_iso()
    last_ts = pairs[-1][0].get("timestamp", now_iso()) if pairs else now_iso()
    model = "claude-opus-5"

    body = (
        f"# Session Log - {first_ts[:10]}\n\n"
        f"Session: `{short}` | Project: `{PROJECT}` | Author: `{AUTHOR}`\n\n"
        "---\n\n"
    )

    for index, (prompt_row, assistant_rows) in enumerate(pairs):
        num = index + 1
        model = next(
            (r.get("message", {}).get("model") for r in assistant_rows if r.get("message", {}).get("model")),
            model,
        )
        body += (
            f"[LOG_ENTRY type=PROMPT num={num} session={short}]\n"
            f"timestamp: {prompt_row.get('timestamp', now_iso())}\n"
            f"model: {model}\n\n"
            f"{prompt_row['message']['content'].rstrip()}\n\n\n"
        )
        if index == len(pairs) - 1 and skip_last_response:
            continue
        text = "\n\n".join(
            t.strip() for t in (assistant_text(r) for r in assistant_rows) if t.strip()
        )
        if not text:
            continue
        ts = assistant_rows[-1].get("timestamp", now_iso())
        body += (
            f"[LOG_ENTRY type=RESPONSE num={num} session={short}]\n"
            f"timestamp: {ts}\n"
            f"model: {model}\n\n"
            f"{text.rstrip()}\n\n\n"
        )

    return build_frontmatter(session_id, model, len(pairs), first_ts, last_ts) + body


def handle_backfill(transcript: str, skip_last_response: bool = False, rebuild: bool = False) -> None:
    """Rebuild prompt/response pairs from a transcript written before the hook existed.

    `skip_last_response` leaves the in-flight turn's response to the live Stop
    hook, so the turn during which the hook was installed is not half-written.
    """
    rows = read_transcript(transcript)
    session_id = next((r.get("sessionId") for r in rows if r.get("sessionId")), "unknown-session")

    pairs: list[tuple[dict, list[dict]]] = []
    for row in rows:
        if is_real_prompt(row):
            pairs.append((row, []))
        elif row.get("type") == "assistant" and pairs:
            pairs[-1][1].append(row)

    # Never rewrite what is already on disk: entries whose prompt timestamp is
    # already recorded are left exactly as they were, and only missing
    # exchanges are appended. Backfill is additive, never destructive.
    existing = log_path(session_id)
    recorded = existing.read_text(encoding="utf-8") if existing.exists() else ""

    if rebuild:
        # Repair mode, for when the additive path cannot reach a gap (a response
        # whose prompt is already recorded). Rewrites the file from the same
        # transcript so every exchange is present and in order. It refuses to
        # run if that would lose any prompt already on disk, so a rebuild can
        # only ever add.
        rebuilt = rebuild_file(session_id, pairs, skip_last_response)
        for prompt_row, _ in pairs:
            body = prompt_row["message"]["content"].strip()
            if body and body in recorded and body not in rebuilt:
                raise SystemExit("refusing to rebuild: would drop an existing prompt")
        for body in re.findall(r"^\[LOG_ENTRY type=PROMPT.*?\n\n(.*?)\n\n\n", recorded, re.S | re.M):
            if body.strip() and body.strip() not in rebuilt:
                raise SystemExit("refusing to rebuild: would drop an existing entry")
        existing.write_text(rebuilt, encoding="utf-8")
        print(f"rebuilt {existing} with {len(pairs)} exchanges")
        return

    num = next_num(session_id, "PROMPT") - 1
    for index, (prompt_row, assistant_rows) in enumerate(pairs):
        prompt_ts = prompt_row.get("timestamp", "")
        if prompt_ts and prompt_ts in recorded:
            continue
        num += 1
        is_last = index == len(pairs) - 1
        model = next(
            (r.get("message", {}).get("model") for r in assistant_rows if r.get("message", {}).get("model")),
            "claude-opus-5",
        )
        append_entry(
            session_id,
            "PROMPT",
            num,
            prompt_row.get("timestamp", now_iso()),
            model,
            prompt_row["message"]["content"],
        )
        if is_last and skip_last_response:
            continue
        body = "\n\n".join(
            t.strip() for t in (assistant_text(r) for r in assistant_rows) if t.strip()
        )
        if body:
            ts = assistant_rows[-1].get("timestamp", now_iso()) if assistant_rows else now_iso()
            append_entry(session_id, "RESPONSE", num, ts, model, body)

    print(f"backfilled {num} exchanges into {log_path(session_id)}")


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else ""

    if mode == "backfill":
        if len(sys.argv) < 3:
            print("usage: capture.py backfill <transcript.jsonl> [--skip-last-response]", file=sys.stderr)
            return 1
        handle_backfill(
            sys.argv[2],
            "--skip-last-response" in sys.argv[3:],
            "--rebuild" in sys.argv[3:],
        )
        return 0

    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}

    if mode == "prompt":
        handle_prompt(payload)
    elif mode == "response":
        handle_response(payload)
    else:
        print(f"unknown mode: {mode}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # a broken hook must never block the session
        print(f"capture hook error: {exc}", file=sys.stderr)
        sys.exit(0)
