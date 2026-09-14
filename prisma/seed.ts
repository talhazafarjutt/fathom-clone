import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

/**
 * Seeds one fully-processed demo meeting so the app can be explored without
 * spending an API call or waiting for transcription.
 *
 *   npm run db:seed [email]
 *
 * Attaches to the given user, or the most recently created one.
 */

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type Line = { speaker: string; start: number; end: number; text: string };

// A believable 6-minute product/customer call.
const TRANSCRIPT: Line[] = [
  { speaker: "A", start: 2_000, end: 11_500, text: "Thanks for making the time. I know the quarter's busy, so let's keep this to the rollout plan and the two blockers you flagged last week." },
  { speaker: "B", start: 12_000, end: 22_000, text: "Sounds good. I'm Priya, I run onboarding here, and Marcus joined because the SSO piece sits with his team." },
  { speaker: "C", start: 22_500, end: 28_000, text: "Hey. Yeah, SSO is mine. I read the doc you sent, I have questions on the SCIM side." },
  { speaker: "A", start: 28_500, end: 41_000, text: "Perfect. Quick recap: we're targeting a pilot with forty users on the fifteenth, then the full six hundred seats two weeks after that, assuming the pilot is clean." },
  { speaker: "B", start: 41_500, end: 56_000, text: "That timeline works on our side as long as the imports are done before the pilot. We have about eleven thousand historical records that need to come across, and last time a bulk import like that took a weekend." },
  { speaker: "A", start: 56_500, end: 70_000, text: "We've changed that. The importer is chunked now, so eleven thousand records is roughly forty minutes, and it's resumable if it fails halfway." },
  { speaker: "B", start: 70_500, end: 78_000, text: "Forty minutes would be a huge improvement. Can we do a dry run against a copy of our data first?" },
  { speaker: "A", start: 78_500, end: 88_000, text: "Yes. Send me an export by Thursday and I'll run it in our staging environment and send you the error report." },
  { speaker: "C", start: 89_000, end: 104_000, text: "On SSO — we're on Okta. The doc says SAML is supported but it wasn't clear whether group claims map to your roles automatically or if we assign roles manually after provisioning." },
  { speaker: "A", start: 104_500, end: 120_000, text: "Group claims map automatically. You set the mapping once in the admin panel, and anyone in the Okta group lands in the matching role. Manual assignment is only for exceptions." },
  { speaker: "C", start: 120_500, end: 132_000, text: "And deprovisioning? When someone leaves, we need access revoked the same day, that's an audit requirement for us." },
  { speaker: "A", start: 132_500, end: 145_000, text: "SCIM handles that. Okta pushes the deactivate event and the session is killed within a minute. We can show you the audit log entry it produces." },
  { speaker: "C", start: 145_500, end: 152_000, text: "That'd help. If I can screenshot that for our security review it saves me a week of back and forth." },
  { speaker: "A", start: 152_500, end: 160_000, text: "I'll record a short walkthrough of the deprovisioning flow and send it over Monday." },
  { speaker: "B", start: 161_000, end: 176_000, text: "The other blocker is training. Six hundred people is a lot, and last rollout we did live sessions and attendance was bad. I'd rather do something self-serve." },
  { speaker: "A", start: 176_500, end: 190_000, text: "We have an in-product tour that covers the first three tasks, and I can give you the slides if you want to run one live session for team leads only." },
  { speaker: "B", start: 190_500, end: 198_000, text: "Team leads only is the right call. How long is the in-product tour?" },
  { speaker: "A", start: 198_500, end: 205_000, text: "Four minutes, and it's skippable. Completion rate across our customers is around seventy percent." },
  { speaker: "B", start: 205_500, end: 214_000, text: "Okay. I'll own the comms and schedule the team lead session for the week of the eighth." },
  { speaker: "C", start: 215_000, end: 226_000, text: "One more thing — pricing. If we go to six hundred seats, does the per-seat rate drop at that tier or do we stay at the pilot rate?" },
  { speaker: "A", start: 226_500, end: 240_000, text: "It drops. Above five hundred seats you move to the volume tier. I'll send updated pricing today so you have it before the finance review." },
  { speaker: "C", start: 240_500, end: 248_000, text: "Today would be great. Finance meets Wednesday and I need it in the packet." },
  { speaker: "A", start: 248_500, end: 262_000, text: "You'll have it this afternoon. So: export by Thursday, dry run after that, walkthrough video Monday, pricing today, and Priya schedules the lead session." },
  { speaker: "B", start: 262_500, end: 270_000, text: "That's everything from me. If the dry run is clean I don't see anything stopping the fifteenth." },
  { speaker: "C", start: 270_500, end: 278_000, text: "Same. Send the video and the pricing and I'll get security and finance moving in parallel." },
  { speaker: "A", start: 278_500, end: 286_000, text: "Great. I'll follow up with notes right after this so everyone has the same list." },
];

const SUMMARY = {
  tldr: "The team locked in a two-stage rollout: a 40-user pilot on the 15th followed by a 600-seat expansion two weeks later. Both blockers — bulk import speed and Okta SSO/SCIM behaviour — were resolved in the call, leaving a dry run and a security walkthrough as the remaining gates.",
  bullets: [
    "Pilot of 40 users targeted for the 15th; full 600-seat rollout two weeks later if the pilot is clean.",
    "The chunked, resumable importer brings 11,000 historical records down from a weekend to roughly 40 minutes.",
    "Okta group claims map to roles automatically; manual assignment is only for exceptions.",
    "SCIM deprovisioning revokes access within a minute and writes an audit log entry, which satisfies the customer's audit requirement.",
    "Training shifts to a 4-minute in-product tour plus one live session for team leads only.",
    "Above 500 seats the account moves to the volume pricing tier.",
  ],
  topics: [
    { title: "Rollout timeline", summary: "Pilot of 40 users on the 15th, then 600 seats two weeks later, gated on a clean pilot.", startMs: 28_500 },
    { title: "Bulk import performance", summary: "11,000 records now import in about 40 minutes with resume support; a dry run against customer data comes first.", startMs: 41_500 },
    { title: "Okta SSO and SCIM", summary: "Group claims map to roles automatically, and SCIM deprovisioning revokes sessions within a minute with an audit trail.", startMs: 89_000 },
    { title: "Training approach", summary: "Self-serve in-product tour for everyone, one live session limited to team leads.", startMs: 161_000 },
    { title: "Pricing at 600 seats", summary: "Crossing 500 seats moves the account to the volume tier; updated pricing needed before Wednesday's finance review.", startMs: 215_000 },
  ],
  questions: [
    { question: "Can we do a dry run of the import against a copy of our data?", answer: "Yes — customer sends an export by Thursday and it runs in staging, with an error report returned.", startMs: 70_500 },
    { question: "Do Okta group claims map to roles automatically?", answer: "Yes, configured once in the admin panel; manual assignment is only for exceptions.", startMs: 89_000 },
    { question: "How fast is deprovisioning when someone leaves?", answer: "SCIM deactivation kills the session within a minute and writes an audit log entry.", startMs: 120_500 },
    { question: "Does the per-seat rate drop at 600 seats?", answer: "Yes — above 500 seats the account moves to the volume tier.", startMs: 215_000 },
  ],
  keywords: ["rollout", "pilot", "bulk import", "Okta", "SSO", "SCIM", "deprovisioning", "training", "pricing"],
  actionItems: [
    { text: "Send updated volume-tier pricing", assignee: "Account team", dueDate: "today, before Wednesday's finance review", startMs: 226_500 },
    { text: "Export historical records for the import dry run", assignee: "Priya", dueDate: "Thursday", startMs: 78_500 },
    { text: "Run the import dry run in staging and share the error report", assignee: "Account team", dueDate: "after the export arrives", startMs: 78_500 },
    { text: "Record a walkthrough of the SCIM deprovisioning flow for the security review", assignee: "Account team", dueDate: "Monday", startMs: 152_500 },
    { text: "Schedule the team-lead training session", assignee: "Priya", dueDate: "week of the 8th", startMs: 205_500 },
  ],
  speakerNames: { A: "Jordan (Cadence)", B: "Priya", C: "Marcus" },
};

/** 8 kHz 8-bit mono silence — gives the player a real, seekable file without shipping media. */
function silentWav(durationSec: number) {
  const sampleRate = 8000;
  const samples = sampleRate * durationSec;
  const buffer = Buffer.alloc(44 + samples, 128);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples, 40);
  return buffer;
}

async function main() {
  const email = process.argv[2];
  const user = email
    ? await db.user.findUnique({ where: { email } })
    : await db.user.findFirst({ orderBy: { createdAt: "desc" } });

  if (!user) {
    console.error(
      "No user found. Sign up in the app first, then run:\n  npm run db:seed [email]",
    );
    process.exit(1);
  }

  const durationSec = 290;

  const meeting = await db.meeting.create({
    data: {
      userId: user.id,
      title: "Acme rollout — pilot scope and SSO",
      status: "READY",
      source: "UPLOAD",
      mimeType: "audio/wav",
      durationSec,
      speakerNames: SUMMARY.speakerNames,
      segments: {
        create: TRANSCRIPT.map((line, idx) => ({
          idx,
          speaker: line.speaker,
          startMs: line.start,
          endMs: line.end,
          text: line.text,
          confidence: 0.95,
        })),
      },
      summary: {
        create: {
          tldr: SUMMARY.tldr,
          bullets: SUMMARY.bullets,
          topics: SUMMARY.topics,
          questions: SUMMARY.questions,
          keywords: SUMMARY.keywords,
          model: "seed",
        },
      },
      actionItems: {
        create: SUMMARY.actionItems.map((item, idx) => ({ idx, ...item })),
      },
    },
  });

  const key = `meetings/${meeting.id}/source.wav`;
  await db.meeting.update({ where: { id: meeting.id }, data: { storageKey: key } });

  const dest = path.join(process.cwd(), "uploads", key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, silentWav(durationSec));

  console.log(`Seeded demo meeting for ${user.email}`);
  console.log(`  http://localhost:3000/meetings/${meeting.id}`);
  console.log("  (demo audio is silent — the transcript and timeline are real)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
