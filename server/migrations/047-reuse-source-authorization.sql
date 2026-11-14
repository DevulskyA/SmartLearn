-- 047 legal eligibility of shared content. A student's own opt-in (reuse_consent, 046) covers only THEIR choices; it cannot authorize reuse of a work
-- they do not own. So content generated from a source is offered to other accounts only when the student ALSO declares, for that specific source,
-- the right to let it be reused: it is their own work, it is licensed for it, or it is in the public domain. Default NULL = not authorized.
-- The declaration is revocable; revoking withdraws what was offered from that source. ADDITIVE: two nullable columns on `sources`.
ALTER TABLE sources ADD COLUMN reuse_basis TEXT CHECK (reuse_basis IN ('OWN_WORK', 'LICENSED', 'PUBLIC_DOMAIN'));
ALTER TABLE sources ADD COLUMN reuse_declared_at TEXT;
