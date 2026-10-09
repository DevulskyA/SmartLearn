-- C5 (audit): a single corrupted/malformed PAGE could previously abort
-- extraction of an ENTIRE otherwise-good document (extract-worker.js had
-- no per-page error boundary -- one bad page threw out of the whole
-- page loop). page_status makes per-page outcome an explicit, queryable
-- fact instead of an all-or-nothing document-level verdict: "existe algum
-- texto" is not the same claim as "a extração desta página teve sucesso".
-- No CHECK enum, same tradeoff already recorded for other status columns.
ALTER TABLE source_pages ADD COLUMN page_status TEXT NOT NULL DEFAULT 'OK';
