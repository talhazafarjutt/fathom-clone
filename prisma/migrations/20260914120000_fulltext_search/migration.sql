-- Full-text search over transcripts and meeting titles.
-- Expression indexes must match the expression used at query time (see lib/search.ts).
CREATE INDEX "transcript_segment_text_fts"
  ON "transcript_segment" USING GIN (to_tsvector('english', "text"));

CREATE INDEX "meeting_title_fts"
  ON "meeting" USING GIN (to_tsvector('english', "title"));
