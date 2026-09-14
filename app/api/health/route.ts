import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Liveness + database reachability. Used by Docker HEALTHCHECK and Render. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "up" });
  } catch {
    return NextResponse.json({ status: "degraded", database: "down" }, { status: 503 });
  }
}
