-- lesson_date: the day the class was given. It is a different fact from study_date (the day the content was studied, the anchor of the 16 reviews).
-- Optional: NULL = unknown, which is every row that exists today (no backfill: the app never recorded it). Additive: one nullable column, no row touched.
-- Reviews keep hanging from study_date only; the service refuses a lesson_date later than study_date.
ALTER TABLE learning_units ADD COLUMN lesson_date TEXT CHECK (lesson_date IS NULL OR lesson_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
