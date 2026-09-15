import type { Metadata } from "next";
import { DM_Mono, Inter, Syne } from "next/font/google";
import "./globals.css";

// The three faces 8x.social uses: Syne for headings, Inter for UI, DM Mono for
// the small uppercase labels.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const syne = Syne({ variable: "--font-syne", subsets: ["latin"], weight: ["600", "700"] });
const dmMono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Cadence — AI meeting notes",
  description:
    "Record or upload a meeting and get a transcript, summary, action items, and a chat that answers questions about the call.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${syne.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
