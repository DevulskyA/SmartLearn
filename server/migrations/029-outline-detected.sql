-- SPRINT-05i (headings without an outline): source_outline entries may now come from the document's own PDF outline
-- (detected = 0) or from headings read from the text's font sizes when the PDF has no outline (detected = 1). Units
-- from detected headings are merged when tiny (a slide is not a unit of study); real outline entries never are.
-- Additive only.
ALTER TABLE source_outline ADD COLUMN detected INTEGER NOT NULL DEFAULT 0 CHECK (detected IN (0, 1));
