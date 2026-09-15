#!/usr/bin/env node
/**
 * Preflight on the environment, so a misconfigured deploy fails with a sentence
 * that says what to do instead of a provider error code.
 *
 *   --phase=build   only what `next build` needs (a parseable DATABASE_URL)
 *   --phase=deploy  everything needed to actually serve traffic
 */
const phase = (process.argv.find((a) => a.startsWith("--phase=")) ?? "--phase=deploy").split("=")[1];
const onVercel = Boolean(process.env.VERCEL);
const problems = [];
const warnings = [];

const raw = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.PRISMA_DATABASE_URL;

if (!raw || raw.trim() === "") {
  problems.push(
    "DATABASE_URL is not set.\n" +
      "    Set it to your Postgres connection string, e.g.\n" +
      "      postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require",
  );
} else {
  const value = raw.trim();

  // The mistakes that actually happen when pasting into a dashboard.
  if (/^['"]|['"]$/.test(value)) {
    problems.push(
      "DATABASE_URL is wrapped in quotes.\n" +
        "    Dashboard fields take the raw value — paste it without the surrounding \" or '.",
    );
  } else if (/^psql\s/i.test(value)) {
    problems.push(
      "DATABASE_URL looks like a psql command, not a URL.\n" +
        "    Paste only the connection string itself, starting with postgresql://",
    );
  } else if (value !== raw) {
    warnings.push("DATABASE_URL has leading or trailing whitespace; it has been trimmed for this check.");
  }

  const scheme = value.split("://")[0];
  const hasScheme = value.includes("://");

  if (!hasScheme) {
    problems.push(
      `DATABASE_URL has no scheme (got ${JSON.stringify(value.slice(0, 24))}…).\n` +
        "    It must start with postgresql:// or postgres://",
    );
  } else if (scheme === "prisma+postgres") {
    problems.push(
      "DATABASE_URL uses the prisma+postgres:// scheme (Prisma Postgres / Accelerate).\n" +
        "    Migrations need the direct connection string. Copy the postgresql:// URL\n" +
        "    from your database dashboard and use that here.",
    );
  } else if (scheme !== "postgresql" && scheme !== "postgres") {
    problems.push(
      `DATABASE_URL scheme "${scheme}" is not a Postgres scheme.\n` +
        "    This app is Postgres-only: use postgresql:// or postgres://",
    );
  } else {
    try {
      const url = new URL(value);
      if (!url.hostname) problems.push("DATABASE_URL has no host.");
      if (!url.pathname.replace("/", "")) {
        problems.push("DATABASE_URL has no database name (the path after the host is empty).");
      }
      if (url.password && /[ #?]/.test(decodeURIComponent(url.password)) && url.password === decodeURIComponent(url.password)) {
        warnings.push(
          "The password in DATABASE_URL contains a character that must be percent-encoded (#, ? or a space).",
        );
      }
    } catch (error) {
      problems.push(`DATABASE_URL could not be parsed as a URL: ${error.message}`);
    }
  }
}

if (phase === "deploy") {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  if (!secret) {
    problems.push(
      "BETTER_AUTH_SECRET is not set.\n" +
        "    Better Auth refuses to sign cookies with its default, which serves 500s on\n" +
        "    every request. Generate one with:  openssl rand -hex 32",
    );
  } else if (secret.length < 32 || /replace-me/i.test(secret)) {
    problems.push(
      "BETTER_AUTH_SECRET is a placeholder or too short. Use at least 32 random\n" +
        "    characters:  openssl rand -hex 32",
    );
  }

  const driver = process.env.STORAGE_DRIVER === "r2" ? "r2" : "local";
  if (driver === "local" && onVercel) {
    problems.push(
      "STORAGE_DRIVER is local, but Vercel's filesystem is read-only, so uploads\n" +
        "    cannot be written and every upload will fail.\n" +
        "    Set STORAGE_DRIVER=r2 and the four R2_* variables, or deploy somewhere\n" +
        "    with a writable disk (see README section 9).",
    );
  }
  if (driver === "r2") {
    const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter(
      (key) => !process.env[key],
    );
    if (missing.length) {
      problems.push(`STORAGE_DRIVER is r2 but these are missing: ${missing.join(", ")}`);
    }
  }

  const transcribe = (process.env.TRANSCRIBE_PROVIDER ?? "").toLowerCase();
  const usingGroq = transcribe === "groq" || (!transcribe && !process.env.ASSEMBLYAI_API_KEY);
  if (usingGroq && !process.env.GROQ_API_KEY) {
    problems.push("GROQ_API_KEY is not set, and Groq is the selected transcription provider.");
  }
  if (usingGroq && onVercel) {
    warnings.push(
      "Groq Whisper transcribes synchronously. On Vercel's Hobby plan functions stop at\n" +
        "    60s, so longer meetings will time out. Use Pro (300s) or\n" +
        "    TRANSCRIBE_PROVIDER=assemblyai, which is submit-then-poll.",
    );
  }
}

for (const warning of warnings) console.warn(`warning: ${warning}`);

if (problems.length) {
  console.error(`\nEnvironment check failed (${problems.length} problem${problems.length > 1 ? "s" : ""}):\n`);
  for (const problem of problems) console.error(`  - ${problem}\n`);
  console.error("See README section 7 for the full list of variables.\n");
  process.exit(1);
}

console.log(`environment ok (${phase})`);
