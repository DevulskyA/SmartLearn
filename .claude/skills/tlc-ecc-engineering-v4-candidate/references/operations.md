# Migrations and Operations

Use for schema changes, backfills, rollouts, deploys, queues, caches, indexes, incompatible protocols, or production state.

Create `.specs/features/<feature>/operations.md` with:

- old/new application and schema compatibility matrix;
- `expand -> backfill -> switch -> observe -> contract` sequence, adapted to the system;
- volume, duration, lock, storage, throughput, and replica-lag estimates;
- idempotent, partitioned, resumable backfill with checkpoints;
- representative preflight and dry run;
- backup and evidence that restoration works;
- metrics, queries, dashboards, numeric abort thresholds, observation window, and responsible operator;
- canary scope and staged rollout;
- rollback or roll-forward procedure for each stage;
- point of irreversibility and recovery plan;
- reconciliation through counts, checksums, and domain invariants;
- separate authorization for production execution and destructive contraction.

Test interruption/restart, duplicate delivery, old/new compatibility, threshold-triggered abort, data-loss detection, and partial failure where applicable. Do not call a procedure rollback if it cannot restore transformed or deleted data.
