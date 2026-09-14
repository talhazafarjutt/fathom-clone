import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";

/** Toggle a public, unguessable share link for a meeting. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const meeting = await db.meeting.findFirst({ where: { id, userId: user.id } });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const enable = meeting.shareToken === null;
  const updated = await db.meeting.update({
    where: { id },
    data: enable
      ? { shareToken: randomBytes(16).toString("hex"), sharedAt: new Date() }
      : { shareToken: null, sharedAt: null },
  });

  return NextResponse.json({ shareToken: updated.shareToken });
}
