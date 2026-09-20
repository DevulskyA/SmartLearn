-- EXAM-4: an exam can cover a whole discipline (questions from several units). Additive only, nothing destroyed.
--   exams.subject_id   NULL = the classic single-unit exam; set = a discipline exam. exams.unit_id stays NOT NULL
--                      and, for a discipline exam, holds the unit of its first question (an anchor; the real
--                      unit of each item is the unit of its exercise).
--   exam_evidence      a discipline exam writes ONE evidence row PER UNIT, so an exam can own several evidence
--                      rows. exams.evidence_id keeps the first one (single-unit exams: the only one).
ALTER TABLE exams ADD COLUMN subject_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_exams_subject ON exams(user_id, subject_id, status);

CREATE TABLE IF NOT EXISTS exam_evidence (
  user_id      INTEGER NOT NULL REFERENCES users(id),
  exam_id      INTEGER NOT NULL,
  evidence_id  INTEGER NOT NULL,
  PRIMARY KEY (exam_id, evidence_id),
  FOREIGN KEY (user_id, exam_id) REFERENCES exams (user_id, id),
  FOREIGN KEY (user_id, evidence_id) REFERENCES learning_evidence (user_id, id)
);

INSERT OR IGNORE INTO exam_evidence (user_id, exam_id, evidence_id)
  SELECT user_id, id, evidence_id FROM exams WHERE evidence_id IS NOT NULL;
