import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Server-side guard for pages and route handlers. */
export async function requireUser() {
  const session = await getSession();
  if (!session?.user) redirect("/sign-in");
  return session.user;
}

/** Same, but for API routes: throws instead of redirecting. */
export async function requireUserApi() {
  const session = await getSession();
  if (!session?.user) return null;
  return session.user;
}
