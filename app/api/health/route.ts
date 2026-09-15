import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { storageHealth } from "@/lib/storage";

/**
 * Liveness, database reachability, and whether storage can actually accept an
 * upload. Used by the Docker HEALTHCHECK and Render, and by a human trying to
 * work out why uploads fail on a deployment they cannot attach a debugger to.
 *
 * It reports configuration shape only — which driver, which variables are
 * present, whether a write succeeds — never a credential value.
 */
export async function GET() {
  const [database, storage] = await Promise.all([
    db
      .$queryRaw`SELECT 1`
      .then(() => "up" as const)
      .catch(() => "down" as const),
    storageHealth(),
  ]);

  const ok = database === "up" && storage.ok;
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", database, storage },
    { status: ok ? 200 : 503 },
  );
}
