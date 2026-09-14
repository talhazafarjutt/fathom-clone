import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  if (session?.user) redirect("/meetings");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8 text-lg font-semibold tracking-tight">
        Cadence
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
