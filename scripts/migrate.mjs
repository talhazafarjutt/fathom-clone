#!/usr/bin/env node
/**
 * Applies the migrations in prisma/migrations to DATABASE_URL.
 *
 * This exists so the runtime image does not have to carry the Prisma CLI. The
 * CLI eagerly loads Studio and its local-dev server, which is over 250 MB of an
 * image that only ever needs to replay SQL — and it drags in a MySQL driver for
 * a database this app never connects to.
 *
 * The bookkeeping is Prisma's own `_prisma_migrations` table, written the same
 * way `prisma migrate deploy` writes it: one row per migration, keyed by
 * directory name, with a SHA-256 checksum of the SQL. `prisma migrate status`
 * and `migrate deploy` therefore still agree with what this script did, which
 * is what the CI job checks.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? "prisma/migrations";

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    id                  VARCHAR(36) PRIMARY KEY NOT NULL,
    checksum            VARCHAR(64) NOT NULL,
    finished_at         TIMESTAMPTZ,
    migration_name      VARCHAR(255) NOT NULL,
    logs                TEXT,
    rolled_back_at      TIMESTAMPTZ,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_steps_count INTEGER NOT NULL DEFAULT 0
  )`;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    await client.query(CREATE_TABLE);

    const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
    // directory names are timestamp-prefixed, so lexicographic order is chronological
    const names = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

    const { rows } = await client.query(
      `SELECT migration_name, checksum FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`,
    );
    const applied = new Map(rows.map((r) => [r.migration_name, r.checksum]));

    let count = 0;
    for (const name of names) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");

      const previous = applied.get(name);
      if (previous) {
        if (previous !== checksum) {
          throw new Error(
            `Migration ${name} was modified after being applied. ` +
              "Roll it forward with a new migration instead of editing it.",
          );
        }
        continue;
      }

      // Each migration lands with its bookkeeping row in one transaction, so an
      // interrupted deploy cannot record a migration it did not finish.
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO "_prisma_migrations"
             (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
           VALUES ($1, $2, $3, now(), now(), 1)`,
          [randomUUID(), checksum, name],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${name} failed: ${error.message}`);
      }

      console.log(`applied ${name}`);
      count += 1;
    }

    console.log(
      count === 0
        ? `no pending migrations (${names.length} already applied)`
        : `applied ${count} migration(s)`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
