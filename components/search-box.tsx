"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (value === current) return;
    const timer = setTimeout(() => {
      router.replace(value ? `/meetings?q=${encodeURIComponent(value)}` : "/meetings");
    }, 250);
    return () => clearTimeout(timer);
  }, [value, params, router]);

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search across transcripts…"
        className="pl-9"
        aria-label="Search meetings"
      />
    </div>
  );
}
