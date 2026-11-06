-- SPRINT-10 (question model): what a question asks the student to demonstrate survives acceptance.
-- The draft already carries questionType (RECALL / CONCEPT / MECHANISM / APPLICATION / DISCRIMINATION /
-- CLINICAL_REASONING / TRANSFER); accepting used to drop it. NULL = not declared (manual exercises, questions the
-- provider did not label, versions from before this migration): never inferred, never invented. Additive only.
ALTER TABLE exercise_versions ADD COLUMN question_type TEXT
  CHECK (question_type IS NULL OR question_type IN ('RECALL','CONCEPT','MECHANISM','APPLICATION','DISCRIMINATION','CLINICAL_REASONING','TRANSFER'));
