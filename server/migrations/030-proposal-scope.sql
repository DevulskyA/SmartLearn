-- SOURCE SCOPE: a proposal is no longer "whole pages N..M". It owns an explicit list of SPANS (character ranges of the stored
-- page text, cut at the real heading positions), so a section that shares a page with its neighbour neither leaks the
-- neighbour's text nor loses its own. spans_json = NULL keeps the old meaning (every character of pages page_start..page_end).
-- `kind` records what the unit is (CONTENT, COPYRIGHT, DEDICATION, SUMMARY, EXERCISE, ANSWER_KEY, ...): only CONTENT is
-- offered to the model. `topic` is what the student asked to study when the scope was approved from a topic search.
-- Additive only.
ALTER TABLE content_proposals ADD COLUMN spans_json TEXT;
ALTER TABLE content_proposals ADD COLUMN kind TEXT NOT NULL DEFAULT 'CONTENT';
ALTER TABLE content_proposals ADD COLUMN topic TEXT;
