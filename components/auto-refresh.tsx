"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server component tree on an interval while work is in flight. */
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
