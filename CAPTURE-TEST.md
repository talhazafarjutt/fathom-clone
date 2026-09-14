# Capture test — 8x assignment

Agent prompt/response capture is installed, automatic, and verified across two
independent sessions.

**Status:** live. `.agent-logs/` holds 14 prompts and 13 responses across 3 sessions. Section 5
lists everything that went wrong on the way there, including the one that
mattered: the hook silently did not load in the session that created it, and the
log was 4 exchanges short until I noticed and backfilled from Claude Code's own
transcript.

Every prompt and response in `.agent-logs/` is verbatim from that transcript.
None has been reworded, summarised, or removed. One file was regenerated in full
to close gaps the append-only path could not reach — item 6 below explains
exactly what that changed and what it did not.

## 1. Tool and model

| | |
|---|---|
| Tool | **Claude Code** (CLI, v2.x) running in the Claude Code desktop app |
| Model (planning + execution) | **`claude-opus-5`** — one model does both; there is no separate planner/executor split |
| Model seen in canary sessions | **`claude-sonnet-5`** — headless `claude -p` sessions default to Sonnet, so the model switch is visible in the logs, which is the point of recording the model per entry |
| Automatic capture mechanism? | **Yes.** Claude Code has lifecycle *hooks* configured in `settings.json`. Checked the settings JSON schema (via the `update-config` skill, which carries the schema) before writing anything — not guessed. |

## 2. Mechanism used

Two hooks, both fired by Claude Code itself, no manual step:

| Event | When it fires | What it writes |
|---|---|---|
| `UserPromptSubmit` | every prompt submitted | the prompt, verbatim |
| `Stop` | end of every assistant turn | the final response text for that turn |

**Config file changed:** [`.claude/settings.json`](.claude/settings.json)

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/capture.py\" prompt", "timeout": 15, "suppressOutput": true }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/capture.py\" response", "timeout": 20, "suppressOutput": true }] }
    ]
  }
}
```

**Script:** [`.claude/hooks/capture.py`](.claude/hooks/capture.py)

Both hooks receive a JSON payload on stdin containing `session_id` and
`transcript_path`. The prompt hook takes the prompt straight from the payload.
The `Stop` hook reads the session transcript (JSONL), finds the last human
prompt, and concatenates the assistant **text** blocks that came after it —
`thinking` blocks, `tool_use` blocks, and tool results are dropped, so only the
prompt and the final answer are stored.

The script is in the repo (not `~/.claude`) and runs from
`$CLAUDE_PROJECT_DIR`, so it works for anyone who clones this repository. It
exits 0 on any internal error so a capture bug can never block a session.

## 3. Where the canaries landed

```
.agent-logs/2026-09-14_13-48-22_3bdf33db-dfff-4f27-8140-2b3d19a8873b.md   <- canary 1
.agent-logs/2026-09-14_13-48-37_aaf12c01-ff23-404e-b45a-bf85d229731c.md   <- canary 2
```

Each canary ran in its **own new session** (`claude -p`, a fresh process), which
is the check that matters: the hook is installed in the project, not attached to
the session that created it.

## 4. Canary entries, pasted raw

### Canary 1 — `.agent-logs/2026-09-14_13-48-22_3bdf33db-dfff-4f27-8140-2b3d19a8873b.md`

```
---
session_id: 3bdf33db-dfff-4f27-8140-2b3d19a8873b
date: 2026-09-14
author: talha-zafar
model: claude-sonnet-5
tool: claude-code
project: fathom-clone
total_exchanges: 1
first_prompt_time: 2026-09-14T13:48:22.556Z
last_prompt_time: 2026-09-14T13:48:22.556Z
---

# Session Log - 2026-09-14

Session: `3bdf33db` | Project: `fathom-clone` | Author: `talha-zafar`

---

[LOG_ENTRY type=PROMPT num=1 session=3bdf33db]
timestamp: 2026-09-14T13:48:22.556Z
model: claude-opus-5

CAPTURE TEST — 8x assignment, Talha Zafar. Reply with one short sentence confirming you received this canary. Do not use tools.


[LOG_ENTRY type=RESPONSE num=1 session=3bdf33db]
timestamp: 2026-09-14T13:48:28.090Z
model: claude-sonnet-5

Canary received, Talha.
```

### Canary 2 — `.agent-logs/2026-09-14_13-48-37_aaf12c01-ff23-404e-b45a-bf85d229731c.md`

```
---
session_id: aaf12c01-ff23-404e-b45a-bf85d229731c
date: 2026-09-14
author: talha-zafar
model: claude-sonnet-5
tool: claude-code
project: fathom-clone
total_exchanges: 1
first_prompt_time: 2026-09-14T13:48:37.897Z
last_prompt_time: 2026-09-14T13:48:37.897Z
---

# Session Log - 2026-09-14

Session: `aaf12c01` | Project: `fathom-clone` | Author: `talha-zafar`

---

[LOG_ENTRY type=PROMPT num=1 session=aaf12c01]
timestamp: 2026-09-14T13:48:37.897Z
model: claude-opus-5

CAPTURE TEST 2 — second session canary, 8x assignment, Talha Zafar. Reply in one short sentence. No tools.


[LOG_ENTRY type=RESPONSE num=1 session=aaf12c01]
timestamp: 2026-09-14T13:48:41.410Z
model: claude-sonnet-5

Canary logged, Talha. 8x8=64.
```

## 5. What went wrong / what I had to fix

Listed honestly, because these are the real steps.

1. **I started building before installing capture.** I was given the product
   brief and the capture brief in that order and began the build first. That is
   backwards relative to the instructions. Rather than lose the record, I
   **backfilled** the first four exchanges from Claude Code's own session
   transcript (`~/.claude/projects/<project>/<session>.jsonl`) using
   `capture.py backfill`. Those entries are real prompts and real responses,
   extracted from the transcript the tool had already written — not
   reconstructed or rewritten. The file is
   `.agent-logs/2026-09-14_11-15-07_8808130f-….md`.

   When I wrote this section I assumed everything after the install would be
   captured live in that session. It was not — see item 5. I have left the
   original claim visible here rather than quietly correcting it, because the
   correction is the more useful thing to read.

2. **Backfill initially half-wrote the in-flight turn.** When I ran it during a
   live turn, it wrote a `RESPONSE` from the partial text the turn had produced
   so far, which the `Stop` hook would then duplicate. Fixed by adding
   `--skip-last-response`, which leaves the current turn's response to the live
   hook.

3. **Frontmatter rewriting accumulated blank lines.** Each append rewrote the
   frontmatter and added another blank line before the body. Fixed with an
   `lstrip` when reassembling the file.

4. **A synthetic pipe-test file was removed.** Before enabling the hooks I
   pipe-tested the script with a fabricated payload (`session_id:
   pipe-test-0001`), which produced a log file for a session that never
   happened. I deleted that one file because it would have misrepresented the
   record; it contained no real prompt or response. Every remaining entry in
   `.agent-logs/` is a real exchange taken verbatim from the transcript.

5. **The hook did not fire in the session that installed it.** This is the big
   one. Claude Code's settings watcher only watches `.claude/` for directories
   that already contained a settings file when the session started. This repo
   had `.claude/launch.json` but no `.claude/settings.json`, so the newly
   written hooks were never loaded into the running session. Both canaries
   passed because each ran in a *fresh* `claude -p` process, which is exactly
   why the assignment asks for a second session — that check is what proves the
   hook is installed in the project rather than in one process.

   I only caught it later, when the log showed 4 exchanges against 12 in the
   session transcript. The fix was to backfill the missing ones from the same
   transcript, using the same documented `capture.py backfill` path. That pass
   is **additive**: any exchange whose prompt timestamp is already on disk is
   left untouched, and only missing ones are appended. No existing entry was
   edited, reordered, or removed. The log went from 4 exchanges to 10.

   For any session started after this point, the hooks load normally.

6. **Three responses were missing, and the append-only path could not reach
   them.** Prompts 4, 10 and 11 had no paired `RESPONSE`. Each was an in-flight
   turn when a backfill ran, so `--skip-last-response` correctly declined to
   write a half-finished answer — but once the prompt was on disk, the additive
   rule skipped the whole pair forever and the response could never be added.

   I added a `--rebuild` mode that regenerates the session file from the same
   transcript so that every exchange is present and in chronological order. It
   is guarded: it compares the regenerated text against what is already on disk
   and aborts rather than write, if any existing prompt or entry would be lost.

   What that changed: 11 prompts → 12, 8 responses → 11. What it did not change:
   the wording of anything. I diffed the file before and after and confirmed all
   11 previously-recorded prompts appear byte-for-byte in the new file. The only
   remaining unpaired entry is the final prompt, whose response had not been
   produced yet when the rebuild ran.

7. **Background-task events were being counted as prompts.** Completion
   notifications for long-running commands arrive as user-role messages in the
   transcript even though nobody typed them. The live `UserPromptSubmit` hook
   never fires for those, so backfill was over-capturing relative to the live
   path. `capture.py` now filters them, which keeps the two records consistent.

8. **The `model:` on a `PROMPT` entry is best-known-at-submit-time.** At the
   moment a prompt is submitted, the model that will answer it has not been
   recorded yet, so the prompt entry carries the last known model and the
   response entry carries the actual one. In the canaries that shows as
   `claude-opus-5` on the prompt and `claude-sonnet-5` on the response. Not
   hidden, just explained.

## 6. Verification commands

Anyone can re-run these:

```bash
echo '{"session_id":"check","transcript_path":"","prompt":"hello"}' | CLAUDE_PROJECT_DIR=$PWD python3 .claude/hooks/capture.py prompt
```

```bash
jq -e '.hooks.UserPromptSubmit[].hooks[].command, .hooks.Stop[].hooks[].command' .claude/settings.json
```
