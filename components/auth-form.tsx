"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === "sign-up";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));
    const name = String(data.get("name") ?? "");

    const result = isSignUp
      ? await authClient.signUp.email({ email, password, name })
      : await authClient.signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message ?? "Something went wrong");
      setPending(false);
      return;
    }

    router.push("/meetings");
    router.refresh();
  }

  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-muted">
            {isSignUp
              ? "Start turning calls into notes in about a minute."
              : "Sign in to see your meetings."}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {isSignUp && (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted">Name</span>
              <Input name="name" required autoComplete="name" placeholder="Alex Rivera" />
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">Email</span>
            <Input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">Password</span>
            <Input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              placeholder="At least 8 characters"
            />
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Spinner />}
            {isSignUp ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="text-sm text-muted">
          {isSignUp ? "Already have an account? " : "No account yet? "}
          <Link
            href={isSignUp ? "/sign-in" : "/sign-up"}
            className="font-medium text-primary hover:underline"
          >
            {isSignUp ? "Sign in" : "Sign up"}
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
