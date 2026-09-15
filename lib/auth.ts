import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";

function getValidOrigin(value: string | undefined) {
  if (!value) return undefined;

  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.origin;
  } catch {
    return undefined;
  }
}

const baseURL =
  getValidOrigin(process.env.BETTER_AUTH_URL) ??
  getValidOrigin(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL,
  ) ??
  getValidOrigin(process.env.V0_RUNTIME_URL);

const developmentOrigins = [
  "http://localhost:3000",
  process.env.V0_RUNTIME_URL,
  process.env.V0_DEV_APP_URL,
  process.env.V0_BUILD_URL,
  process.env.V0_SANDBOX_URL,
].filter((origin): origin is string => Boolean(getValidOrigin(origin))).map(
  (origin) => getValidOrigin(origin)!,
);

const productionOrigins = [
  process.env.VERCEL_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
].filter((origin): origin is string => Boolean(getValidOrigin(origin))).map(
  (origin) => getValidOrigin(origin)!,
);

export const auth = betterAuth({
  appName: "Fathom Clone",
  baseURL,
  trustedOrigins: process.env.NODE_ENV === "development"
    ? developmentOrigins
    : productionOrigins,
  database: prismaAdapter(db, { provider: "postgresql" }),
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
  emailAndPassword: {
    enabled: true,
    // demo app: no mail provider wired up
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  // nextCookies() must stay last — it flushes Set-Cookie from server actions
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
