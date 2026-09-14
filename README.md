# Cadence — AI meeting notes

A Fathom-style meeting intelligence app. Record a call in the browser or drop in a file;
Cadence transcribes it with speaker labels, writes a summary and action items, makes every
word searchable, and answers questions about the call with citations you can click to jump
to that moment in the audio.

```
upload / record ──▶ storage ──▶ AssemblyAI ──▶ Claude ──▶ transcript + summary + actions
                                                             │
                                                             └─▶ full-text search, chat, share link
```

---

## Quick start

Requirements: Node 20+, Docker (for Postgres), an AssemblyAI key and an Anthropic key.

```bash
npm install
cp .env.example .env   # then fill in the two API keys (see below)
npm run db:up          # Postgres on :5433 via docker compose
npm run db:migrate     # create the schema
npm run dev            # http://localhost:3000
```

Sign up at `/sign-up`, then optionally load a fully-processed demo meeting so you can see
the finished product without waiting for a transcription:

```bash
npm run db:seed
```

### Environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Points at the docker-compose Postgres by default |
| `BETTER_AUTH_SECRET` | yes | `openssl rand -hex 32` |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` | yes | App origin |
| `ASSEMBLYAI_API_KEY` | yes | Transcription + diarization ([assemblyai.com](https://www.assemblyai.com)) |
| `ANTHROPIC_API_KEY` | yes | Summaries and chat |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-opus-5` |
| `STORAGE_DRIVER` | no | `local` (default) or `r2` |
| `R2_*` | only for `r2` | Account id, keys, bucket, optional public base URL |

Without the two API keys the app still runs — uploads succeed and the meeting lands in
`FAILED` with the reason shown in the UI.

---

## What's implemented

**Capture** — drag-and-drop upload of any audio/video file, or in-browser recording.
The recorder captures the microphone and, when you share a tab with audio, mixes the tab's
audio into the same track so both sides of a call end up in one file.

**Processing** — a state machine (`QUEUED → TRANSCRIBING → SUMMARIZING → READY`) with
per-transition claiming, so concurrent callers can't double-submit. Failures are recorded
on the meeting and surfaced in the UI rather than swallowed.

**Transcript** — diarized, timestamped, synced to the audio. The current line highlights as
it plays, the pane follows along, and clicking any line seeks there.

**Summary** — TL;DR, key points, chapters, and questions raised. Chapters and questions
carry timestamps, so every claim is one click from its evidence.

**Action items** — explicit commitments only, with owner and due date when they were stated,
plus a checkbox with optimistic updates.

**Ask the meeting** — streaming chat over the transcript. The model is instructed to cite
`[m:ss]` timestamps; the UI turns each one into a seek button. The transcript is sent as a
cached system block, so follow-up questions are cheap.

**Search** — Postgres full-text search across titles and every spoken word, with
`ts_headline` snippets and a deep link into the audio at the matching moment.

**Sharing** — a public read-only link guarded by an unguessable token, revocable in one click.

---

## Architecture and decisions

**Next.js 16 (App Router) + TypeScript, one deployable.** Server components do the reads,
route handlers own mutations and streaming. No separate API service to run or explain.

**Postgres + Prisma 7.** Relational data with a real relational shape (meetings → segments,
summary, action items, messages). Migrations are checked in, including a hand-written one for
the full-text GIN indexes.

**Better Auth instead of a hosted auth vendor.** Email + password, sessions in Postgres.
It means this repo runs end to end with no third-party auth signup — `docker compose up`,
two API keys, done.

**AssemblyAI for transcription.** Diarization, word-level timings, and language detection in
a single call. Raw Whisper was rejected: without speaker labels the core product doesn't
exist. Local files are streamed to AssemblyAI's upload endpoint (localhost isn't reachable
from their workers); R2 objects are passed by signed URL instead.

**Claude for the language work.** The summary comes back through structured outputs against
a Zod schema, so the pipeline never parses free text — a malformed summary is an error, not a
silent corruption. The summarizer also maps diarization labels (`A`, `B`) to real names when
someone is introduced on the call.

**No job queue.** `advanceMeeting()` performs one transition per call and is idempotent. The
client polls it while a meeting is processing; in production a provider webhook calls the same
function. That removes a service, a dashboard, and a class of local-dev problems — the tradeoff
is that a browser has to be open to drive a poll, which a webhook (or a cron hitting
`/api/meetings/:id/advance`) resolves.

**Two storage drivers.** Local disk for development, Cloudflare R2 for deployment. R2 uses a
presigned `PUT` straight from the browser, which is what keeps large media off the serverless
request path entirely; the local driver streams through a route handler. Both are behind one
interface, and the local media route implements HTTP range requests so seeking works.

**No RAG.** Meetings fit comfortably in a 1M-token context window. A vector database would have
added infrastructure and retrieval bugs in exchange for nothing at this scale.

---

## Deploying

1. Push to GitHub, import into Vercel.
2. Provision Postgres (Neon works well) and set `DATABASE_URL`.
3. Set `STORAGE_DRIVER=r2` plus the `R2_*` variables — the 4.5 MB serverless body limit makes
   direct-to-bucket uploads mandatory in production.
4. Set `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` to the deployed origin.
5. Run `npm run db:deploy` against the production database.

---

## Project layout

```
app/
  (auth)/            sign-in, sign-up
  (app)/meetings/    dashboard, meeting workspace
  share/[token]/     public read-only view
  api/               route handlers (meetings, upload, media, chat, share)
components/meeting/  player, transcript, summary, action items, chat
lib/
  pipeline.ts        the QUEUED → READY state machine
  transcribe.ts      AssemblyAI
  ai/summarize.ts    structured summary (Zod + Claude)
  ai/chat.ts         streaming chat with timestamp citations
  storage.ts         local / R2 drivers
  search.ts          Postgres full-text search
prisma/              schema, migrations, demo seed
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Generate Prisma client and build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:up` / `db:down` | Postgres via docker compose |
| `npm run db:migrate` / `db:deploy` | Migrations (dev / production) |
| `npm run db:seed` | Load the demo meeting |
| `npm run db:studio` | Prisma Studio |

---

## Known gaps and what I'd do next

- **Joining live calls.** Cadence records from the browser rather than sending a bot into a
  Zoom/Meet/Teams call. A real bot is a meeting-platform integration in its own right; the
  path I'd take is Recall.ai, which drops into the existing pipeline as a third
  `MeetingSource` — the bot's recording URL replaces the upload step and nothing downstream
  changes.
- **Webhook-driven processing.** The `advance` endpoint is already the webhook handler; it just
  needs an AssemblyAI `webhook_url` and a public origin to stop depending on the client poll.
- **Tests.** Given the time budget I verified the pipeline end to end by hand (upload → storage →
  ingest → state transitions → failure surfacing). The pieces worth unit tests first are
  `parseTimestamp`/`extractCitations` and the pipeline's transition claiming.
- **Speaker renaming in the UI.** The data model and API accept a speaker→name map and the
  summarizer populates it; there is no inline editor for corrections yet.
- **CRM export.** Action items are structured enough to push into HubSpot or Salesforce.
- **Rate limiting** on the chat and upload routes before this faces real users.
