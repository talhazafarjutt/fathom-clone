import { db } from "@/lib/db";

export type SearchHit = {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  durationSec: number | null;
  /** Highlighted transcript excerpt (contains <mark> tags), null for title-only hits. */
  snippet: string | null;
  startMs: number | null;
};

/**
 * Postgres full-text search across meeting titles and transcripts.
 * Uses the GIN expression indexes added in the `fulltext_search` migration —
 * the expressions here must stay identical to the ones indexed.
 */
export async function searchMeetings(userId: string, query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  return db.$queryRaw<SearchHit[]>`
    WITH matches AS (
      SELECT
        m.id,
        m.title,
        m.status::text AS status,
        m."createdAt",
        m."durationSec",
        s.text AS segment_text,
        s."startMs",
        ts_rank(to_tsvector('english', coalesce(s.text, m.title)), plainto_tsquery('english', ${q})) AS rank,
        ROW_NUMBER() OVER (
          PARTITION BY m.id
          ORDER BY ts_rank(to_tsvector('english', coalesce(s.text, m.title)), plainto_tsquery('english', ${q})) DESC
        ) AS rn
      FROM "meeting" m
      LEFT JOIN "transcript_segment" s ON s."meetingId" = m.id
      WHERE m."userId" = ${userId}
        AND (
          to_tsvector('english', m.title) @@ plainto_tsquery('english', ${q})
          OR to_tsvector('english', s.text) @@ plainto_tsquery('english', ${q})
        )
    )
    SELECT
      id,
      title,
      status,
      "createdAt",
      "durationSec",
      CASE
        WHEN segment_text IS NULL THEN NULL
        ELSE ts_headline('english', segment_text, plainto_tsquery('english', ${q}),
                         'StartSel=<mark>,StopSel=</mark>,MaxFragments=1,MaxWords=28,MinWords=8')
      END AS snippet,
      "startMs"
    FROM matches
    WHERE rn = 1
    ORDER BY rank DESC, "createdAt" DESC
    LIMIT 25;
  `;
}
