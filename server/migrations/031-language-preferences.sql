-- LANGUAGE PREFERENCES (R-13). Two independent preferences of the student, both NULL until chosen:
--   ui_locale          language of the interface
--   generation_locale  language the pedagogical content is generated in; initialized once at the first generation from the
--                      best available hint and changed afterwards only by an explicit action of the student
-- Neither is derived from the other, from the language of an imported document or from the system region after being set.
-- Additive only: existing rows keep both NULL and read as "not chosen yet".
ALTER TABLE user_settings ADD COLUMN ui_locale TEXT;
ALTER TABLE user_settings ADD COLUMN generation_locale TEXT;
