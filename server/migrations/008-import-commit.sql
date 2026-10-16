-- T27: commit outcome tracked directly on the owning preview row. A
-- previewId is already 1:1 bound to one exact checksum-verified source
-- (T26), so a second commit attempt against the SAME previewId — any
-- caller, any retry — returns the original result instead of inserting
-- again, rather than depending on a client-supplied operation key.
ALTER TABLE import_previews ADD COLUMN committed_at TEXT;
ALTER TABLE import_previews ADD COLUMN commit_result_json TEXT;
