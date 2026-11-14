-- SOURCE KIND OF A LESSON: what kind of material a lesson came from, chosen when the content is added (plan
-- conductor/tracks/p1-materiais-ia-versoes-20261114, P1-DISC1). The lesson already names its discipline (subject_id, required) and its
-- source (source_text); this is the missing third fact:
--   APOSTILA  handout / class notes     LIVRO  book or article     VIDEO  video class     OUTRO  anything else
-- NULL = not said (every lesson that existed before this migration, and any lesson added without choosing). Never invented for old rows.
-- Additive only: one nullable column with a fixed set of values; no existing row, index or constraint is touched.
ALTER TABLE learning_units ADD COLUMN source_kind TEXT CHECK (source_kind IS NULL OR source_kind IN ('APOSTILA', 'LIVRO', 'VIDEO', 'OUTRO'));
