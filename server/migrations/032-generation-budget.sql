-- GENERATION BUDGET (R-12). The ledger of what the pedagogical generation is ALLOWED to spend and what it did spend.
-- One row per generation attempt that could reach an external model:
--   RESERVED  balance held BEFORE the provider is called (estimated_units); counts against the limits
--   SETTLED   the call happened: consumed_units is what it cost (MEASURED by the provider, or ESTIMATED when the provider
--             cannot measure, or ESTIMATED_ORPHAN when a crash left it unresolved and it is charged at the estimate)
--   RELEASED  failure BEFORE any external call: nothing was spent, the balance is returned
-- Units are estimated model tokens (provider-agnostic). week_key (ISO week, UTC) and month_key (UTC) are fixed at
-- reservation time so a period's usage is a plain sum. Limit VALUES live in configuration, not here (pending human
-- decision HG-11). Additive only.
CREATE TABLE generation_reservations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  proposal_id       INTEGER,
  state             TEXT NOT NULL CHECK (state IN ('RESERVED', 'SETTLED', 'RELEASED')),
  estimated_units   INTEGER NOT NULL CHECK (estimated_units >= 0),
  consumed_units    INTEGER CHECK (consumed_units IS NULL OR consumed_units >= 0),
  consumption_basis TEXT,
  week_key          TEXT NOT NULL,
  month_key         TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  settled_at        TEXT
);
CREATE INDEX idx_generation_reservations_week ON generation_reservations (user_id, week_key);
CREATE INDEX idx_generation_reservations_month ON generation_reservations (user_id, month_key);
CREATE INDEX idx_generation_reservations_state ON generation_reservations (state, created_at);
