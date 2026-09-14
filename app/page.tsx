import Link from "next/link";
import { redirect } from "next/navigation";
import { AudioLines, ListChecks, MessagesSquare, Sparkles } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/session";

const features = [
  {
    icon: AudioLines,
    title: "Speaker-aware transcript",
    body: "Diarized, timestamped, and synced to the audio — click any line to jump there.",
  },
  {
    icon: Sparkles,
    title: "Summary you can trust",
    body: "TL;DR, chapters, and key questions, each anchored to the moment it came from.",
  },
  {
    icon: ListChecks,
    title: "Action items",
    body: "Explicit commitments only, with owner and due date when they were stated.",
  },
  {
    icon: MessagesSquare,
    title: "Ask the meeting",
    body: "Chat over the call. Every answer cites timestamps you can click to verify.",
  },
];

export default async function LandingPage() {
  const session = await getSession();
  if (session?.user) redirect("/meetings");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">Cadence</span>
        <nav className="flex items-center gap-2">
          <Link href="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Sign in
          </Link>
          <Link href="/sign-up" className={buttonVariants({ size: "sm" })}>
            Get started
          </Link>
        </nav>
      </header>

      <section className="flex flex-col items-start gap-6 py-20">
        <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
          Meeting intelligence
        </span>
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Every call, written up before you close the tab.
        </h1>
        <p className="max-w-xl text-base text-muted">
          Record in the browser or drop in a file. Cadence transcribes it with speaker
          labels, writes the summary and action items, and answers questions about what
          was said — with citations back to the audio.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
            Start free
          </Link>
          <Link
            href="/sign-in"
            className={buttonVariants({ variant: "secondary", size: "lg" })}
          >
            I already have an account
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {features.map(({ icon: Icon, title, body }) => (
          <Card key={title}>
            <CardBody className="space-y-2">
              <Icon className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
              <p className="text-sm text-muted">{body}</p>
            </CardBody>
          </Card>
        ))}
      </section>
    </main>
  );
}
