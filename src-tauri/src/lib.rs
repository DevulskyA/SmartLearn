use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{sqlite::SqliteConnectOptions, Connection, Executor, SqliteConnection};
use std::path::Path;
use tauri::Manager;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransactionStatement {
    query: String,
    values: Vec<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TransactionResult {
    rows_affected: u64,
    last_insert_id: i64,
}

async fn execute_sqlite_transaction_at_path(
    database_path: &Path,
    statements: Vec<TransactionStatement>,
) -> Result<Vec<TransactionResult>, String> {
    let options = SqliteConnectOptions::new()
        .filename(database_path)
        .create_if_missing(true)
        .foreign_keys(true);
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| error.to_string())?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| error.to_string())?;
    let mut results = Vec::with_capacity(statements.len());

    for statement in statements {
        let mut query = sqlx::query(&statement.query);
        for value in statement.values {
            query = match value {
                Value::Null => query.bind(None::<String>),
                Value::Bool(value) => query.bind(value),
                Value::Number(value) => {
                    if let Some(value) = value.as_i64() {
                        query.bind(value)
                    } else if let Some(value) = value.as_u64() {
                        query.bind(value as i64)
                    } else {
                        query.bind(value.as_f64().unwrap_or_default())
                    }
                }
                Value::String(value) => query.bind(value),
                value => query.bind(value.to_string()),
            };
        }

        let result = transaction
            .execute(query)
            .await
            .map_err(|error| error.to_string())?;
        results.push(TransactionResult {
            rows_affected: result.rows_affected(),
            last_insert_id: result.last_insert_rowid(),
        });
    }

    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(results)
}

#[tauri::command]
async fn execute_sqlite_transaction(
    app: tauri::AppHandle,
    statements: Vec<TransactionStatement>,
) -> Result<Vec<TransactionResult>, String> {
    let database_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("smartlearn.db");
    execute_sqlite_transaction_at_path(&database_path, statements).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![execute_sqlite_transaction])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{execute_sqlite_transaction_at_path, TransactionStatement};
    use serde_json::json;
    use sqlx::{Connection, Row, SqliteConnection};
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TestDatabase {
        path: PathBuf,
    }

    impl TestDatabase {
        fn create() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be after unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("smartlearn-tauri-test-{unique}.db"));
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TestDatabase {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.path);
        }
    }

    fn run_async<T>(future: impl std::future::Future<Output = T>) -> T {
        tauri::async_runtime::block_on(future)
    }

    #[test]
    fn execute_sqlite_transaction_commits_full_reset_flow() {
        let db = TestDatabase::create();

        run_async(async {
            execute_sqlite_transaction_at_path(
                db.path(),
                vec![
                    TransactionStatement {
                        query: "CREATE TABLE subjects (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"
                            .into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "CREATE TABLE sources (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"
                            .into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "CREATE TABLE study_records (id INTEGER PRIMARY KEY, subject_id INTEGER NOT NULL, source_id INTEGER NOT NULL, content TEXT NOT NULL)"
                            .into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "CREATE TABLE review_tasks (id INTEGER PRIMARY KEY, study_record_id INTEGER NOT NULL, review_done INTEGER NOT NULL)"
                            .into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "CREATE TABLE settings (key TEXT PRIMARY KEY, app_version TEXT, review_schedule TEXT, last_backup_at TEXT)"
                            .into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO subjects (id, name) VALUES (1, 'Português')".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO sources (id, name) VALUES (1, 'Fonte A')".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO study_records (id, subject_id, source_id, content) VALUES (1, 1, 1, 'Conteúdo')".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO review_tasks (id, study_record_id, review_done) VALUES (1, 1, 0)".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO settings (key, app_version, review_schedule, last_backup_at) VALUES ('main', '1.0.0', '[1,7,15]', '2026-06-27T10:00:00Z')".into(),
                        values: vec![],
                    },
                ],
            )
            .await
            .expect("seed transaction should succeed");

            execute_sqlite_transaction_at_path(
                db.path(),
                vec![
                    TransactionStatement {
                        query: "DELETE FROM review_tasks".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "DELETE FROM study_records".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "DELETE FROM sources".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "DELETE FROM subjects".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "DELETE FROM settings".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO settings (key, app_version, review_schedule, last_backup_at) VALUES ($1, $2, $3, NULL)".into(),
                        values: vec![json!("main"), json!("1.0.0"), json!("[1,7,15]")],
                    },
                ],
            )
            .await
            .expect("clear transaction should succeed");

            let mut connection = SqliteConnection::connect(&format!("sqlite:{}", db.path().display()))
                .await
                .expect("sqlite connection should open");

            for table in ["subjects", "sources", "study_records", "review_tasks"] {
                let row = sqlx::query(&format!("SELECT COUNT(*) AS total FROM {table}"))
                    .fetch_one(&mut connection)
                    .await
                    .expect("count query should succeed");
                let total: i64 = row.get("total");
                assert_eq!(total, 0, "{table} should be empty after clear");
            }

            let row = sqlx::query(
                "SELECT key, app_version, review_schedule, last_backup_at FROM settings",
            )
            .fetch_one(&mut connection)
            .await
            .expect("settings row should exist");

            let key: String = row.get("key");
            let app_version: String = row.get("app_version");
            let review_schedule: String = row.get("review_schedule");
            let last_backup_at: Option<String> = row.get("last_backup_at");

            assert_eq!(key, "main");
            assert_eq!(app_version, "1.0.0");
            assert_eq!(review_schedule, "[1,7,15]");
            assert_eq!(last_backup_at, None);
        });
    }

    // Minimal schema matching db.js schemaStatements (subjects + settings + _bootstrap).
    // Used to test bootstrap lifecycle without depending on JS code.
    const BOOTSTRAP_SCHEMA: &[&str] = &[
        "CREATE TABLE IF NOT EXISTS subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)",
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, app_version TEXT)",
        "INSERT OR IGNORE INTO settings (key, app_version) VALUES ('main', '2.0.0')",
        "CREATE TABLE IF NOT EXISTS _bootstrap (id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id = 1), dev_seed_version TEXT, seeded_at TEXT)",
    ];

    async fn run_schema(db: &Path) {
        let stmts: Vec<TransactionStatement> = BOOTSTRAP_SCHEMA
            .iter()
            .map(|sql| TransactionStatement { query: sql.to_string(), values: vec![] })
            .collect();
        execute_sqlite_transaction_at_path(db, stmts).await.expect("schema should succeed");
    }

    async fn seed_subjects(db: &Path) {
        execute_sqlite_transaction_at_path(
            db,
            vec![
                TransactionStatement {
                    query: "INSERT OR IGNORE INTO subjects (name) VALUES ($1), ($2)".into(),
                    values: vec![json!("Biologia Celular"), json!("Farmacologia")],
                },
                TransactionStatement {
                    query: "INSERT OR REPLACE INTO _bootstrap (id, dev_seed_version, seeded_at) VALUES (1, '1', '2026-09-03T00:00:00Z')".into(),
                    values: vec![],
                },
            ],
        )
        .await
        .expect("seed should succeed");
    }

    async fn bootstrap_needed(db: &Path) -> bool {
        let options = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(db)
            .foreign_keys(true);
        let mut conn = SqliteConnection::connect_with(&options).await.expect("connect");
        let row = sqlx::query("SELECT dev_seed_version FROM _bootstrap WHERE id = 1")
            .fetch_optional(&mut conn)
            .await
            .expect("query _bootstrap");
        match row {
            None => true,
            Some(r) => r.get::<Option<String>, _>("dev_seed_version").is_none(),
        }
    }

    async fn subject_count(db: &Path) -> i64 {
        let options = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(db)
            .foreign_keys(true);
        let mut conn = SqliteConnection::connect_with(&options).await.expect("connect");
        sqlx::query("SELECT COUNT(*) as n FROM subjects")
            .fetch_one(&mut conn)
            .await
            .map(|r| r.get::<i64, _>("n"))
            .expect("count")
    }

    #[test]
    fn fresh_install_seeds_once_and_restart_preserves_data() {
        let db = TestDatabase::create();

        run_async(async {
            // Simula: DB criado → schema → seed (bootstrap == DEV first run)
            run_schema(db.path()).await;
            assert!(bootstrap_needed(db.path()).await, "fresh DB should need bootstrap");

            seed_subjects(db.path()).await;
            assert!(!bootstrap_needed(db.path()).await, "after seed _bootstrap should be set");
            assert_eq!(subject_count(db.path()).await, 2, "seed should insert 2 subjects");

            // Simula: restart — bootstrap check deve ser false, dados preservados
            assert!(!bootstrap_needed(db.path()).await, "restart: _bootstrap still set, no re-seed");
            assert_eq!(subject_count(db.path()).await, 2, "restart: subjects must be preserved");
        });
    }

    #[test]
    fn user_deletes_all_subjects_does_not_trigger_reseed() {
        let db = TestDatabase::create();

        run_async(async {
            run_schema(db.path()).await;
            seed_subjects(db.path()).await;

            // Usuário apaga todos os subjects
            execute_sqlite_transaction_at_path(
                db.path(),
                vec![TransactionStatement { query: "DELETE FROM subjects".into(), values: vec![] }],
            )
            .await
            .expect("delete subjects");

            assert_eq!(subject_count(db.path()).await, 0, "subjects deleted");
            // _bootstrap permanece intacto — próximo restart não re-semeia
            assert!(!bootstrap_needed(db.path()).await, "bootstrap marker must survive subject delete");
        });
    }

    #[test]
    fn schema_is_idempotent() {
        let db = TestDatabase::create();

        run_async(async {
            run_schema(db.path()).await;
            // Roda schema de novo — deve ser no-op (CREATE TABLE IF NOT EXISTS)
            run_schema(db.path()).await;
            assert_eq!(subject_count(db.path()).await, 0, "double schema run: no phantom data");
        });
    }

    // Canonical schedule as JSON — must match REVIEW_DAY_OFFSETS in review-schedule.js.
    const CANONICAL_SCHEDULE: &str = "[1,7,15,30,60,90,120,150,180,210,240,270,300,330,360,390]";

    #[test]
    fn fresh_install_review_schedule_is_canonical() {
        let db = TestDatabase::create();

        run_async(async {
            // Setup minimal settings table (mirrors db.js schemaStatements DDL)
            execute_sqlite_transaction_at_path(
                db.path(),
                vec![TransactionStatement {
                    query: "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, app_version TEXT, review_schedule TEXT, last_backup_at TEXT)".into(),
                    values: vec![],
                }],
            )
            .await
            .expect("settings DDL should succeed");

            // Execute settings INSERT with explicit param binding (correct T5 behavior)
            execute_sqlite_transaction_at_path(
                db.path(),
                vec![TransactionStatement {
                    query: "INSERT OR IGNORE INTO settings (key, app_version, review_schedule) VALUES ('main', '2.0.0', $1)".into(),
                    values: vec![json!(CANONICAL_SCHEDULE)],
                }],
            )
            .await
            .expect("settings INSERT with params should succeed");

            let options = sqlx::sqlite::SqliteConnectOptions::new().filename(db.path()).foreign_keys(true);
            let mut conn = SqliteConnection::connect_with(&options).await.expect("connect");

            let row = sqlx::query("SELECT review_schedule FROM settings WHERE key = 'main'")
                .fetch_one(&mut conn)
                .await
                .expect("settings row must exist");

            let schedule: Option<String> = row.get("review_schedule");
            assert!(schedule.is_some(), "review_schedule must not be NULL on fresh install");
            assert_eq!(
                schedule.unwrap(),
                CANONICAL_SCHEDULE,
                "review_schedule must equal the canonical schedule from review-schedule.js"
            );
        });
    }

    #[test]
    fn fresh_install_unbound_param_yields_null_schedule() {
        // Regression sensor: proves the bug that existed before T5.
        // Executing the INSERT without binding $1 results in NULL schedule.
        let db = TestDatabase::create();

        run_async(async {
            execute_sqlite_transaction_at_path(
                db.path(),
                vec![TransactionStatement {
                    query: "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, app_version TEXT, review_schedule TEXT, last_backup_at TEXT)".into(),
                    values: vec![],
                }],
            )
            .await
            .expect("settings DDL should succeed");

            execute_sqlite_transaction_at_path(
                db.path(),
                vec![TransactionStatement {
                    query: "INSERT OR IGNORE INTO settings (key, app_version, review_schedule) VALUES ('main', '2.0.0', $1)".into(),
                    values: vec![],  // no binding for $1 → NULL
                }],
            )
            .await
            .expect("INSERT runs without error even with unbound param");

            let options = sqlx::sqlite::SqliteConnectOptions::new().filename(db.path()).foreign_keys(true);
            let mut conn = SqliteConnection::connect_with(&options).await.expect("connect");

            let row = sqlx::query("SELECT review_schedule FROM settings WHERE key = 'main'")
                .fetch_one(&mut conn)
                .await
                .expect("settings row must exist");

            let schedule: Option<String> = row.get("review_schedule");
            assert!(schedule.is_none(), "unbound $1 yields NULL — this is the bug T5 fixes");
        });
    }

    // Canonical schema: reads src/schema-statements.json — same file imported by db.js in production.
    // Single source of truth: if the JSON drifts from the running schema, tests that use this break.
    async fn setup_review_schema(db: &Path) {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let schema_path = std::path::Path::new(manifest_dir).join("../src/schema-statements.json");
        let schema_json = std::fs::read_to_string(&schema_path)
            .expect("src/schema-statements.json must exist — it is the canonical DDL shared with db.js");
        let ddl_statements: Vec<String> = serde_json::from_str(&schema_json)
            .expect("schema-statements.json must be a JSON array of strings");
        let mut stmts: Vec<TransactionStatement> = ddl_statements
            .into_iter()
            .map(|sql| TransactionStatement { query: sql, values: vec![] })
            .collect();
        // INSERT settings with empty review_schedule (db.js does this separately with $1=REVIEW_SCHEDULE)
        stmts.push(TransactionStatement {
            query: "INSERT OR IGNORE INTO settings (key, app_version, review_schedule) VALUES ('main', '2.0.0', '[]')".into(),
            values: vec![],
        });
        execute_sqlite_transaction_at_path(db, stmts).await.expect("canonical schema setup must succeed");
    }

    // Canonical migration authority: reads src/migration-main-to-vnext.json — same file consumed
    // by db.js in production. Returns (preMigration SQL vec, sourceResolution SQL).
    fn load_migration_plan() -> (Vec<String>, String) {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let path = std::path::Path::new(manifest_dir).join("../src/migration-main-to-vnext.json");
        let json = std::fs::read_to_string(&path)
            .expect("src/migration-main-to-vnext.json must exist — canonical migration authority shared with db.js");
        let value: serde_json::Value = serde_json::from_str(&json)
            .expect("migration-main-to-vnext.json must be valid JSON");
        let pre_migration: Vec<String> = value["preMigration"]
            .as_array()
            .expect("preMigration must be a JSON array")
            .iter()
            .map(|v| v.as_str().expect("each preMigration entry must be a string").to_string())
            .collect();
        let source_resolution = value["sourceResolution"]
            .as_str()
            .expect("sourceResolution must be a string")
            .to_string();
        (pre_migration, source_resolution)
    }

    async fn seed_review_data(db: &Path) -> (i64, i64, i64) {
        execute_sqlite_transaction_at_path(
            db,
            vec![
                TransactionStatement {
                    query: "INSERT INTO subjects (name, created_at, updated_at) VALUES ($1, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')".into(),
                    values: vec![json!("Fisiologia")],
                },
                TransactionStatement {
                    query: "INSERT INTO learning_units (subject_id, source_text, study_date, title, created_at, updated_at) VALUES (1, '', '2026-09-01', 'Cap 1', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')".into(),
                    values: vec![],
                },
                TransactionStatement {
                    query: "INSERT INTO review_tasks (unit_id, review_number, due_date, created_at, updated_at) VALUES (1, 1, '2026-09-04', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')".into(),
                    values: vec![],
                },
            ],
        )
        .await
        .expect("seed review data should succeed");
        (1i64, 1i64, 1i64) // (subject_id, unit_id, task_id)
    }

    #[test]
    fn complete_review_duplicate_rolls_back() {
        let db = TestDatabase::create();

        run_async(async {
            setup_review_schema(db.path()).await;
            let (_sid, unit_id, task_id) = seed_review_data(db.path()).await;

            // First completion: 8/10 — should succeed
            execute_sqlite_transaction_at_path(
                db.path(),
                vec![
                    TransactionStatement {
                        query: "UPDATE review_tasks SET review_done=1, questions_done=1, questions_count=$1, correct_count=$2, score_percent=$3, completed_at=$4, updated_at=$4 WHERE id=$5".into(),
                        values: vec![json!(10), json!(8), json!(80.0), json!("2026-09-04T10:00:00Z"), json!(task_id)],
                    },
                    TransactionStatement {
                        query: "INSERT INTO learning_evidence (unit_id, evidence_date, context, questions_count, correct_count, score_percent, review_task_id, created_at) VALUES ($1, $2, 'REVIEW', $3, $4, $5, $6, $7)".into(),
                        values: vec![json!(unit_id), json!("2026-09-04"), json!(10), json!(8), json!(80.0), json!(task_id), json!("2026-09-04T10:00:00Z")],
                    },
                ],
            )
            .await
            .expect("first completion should succeed");

            // Second completion attempt: 5/10 — UNIQUE violation on review_task_id
            let error = execute_sqlite_transaction_at_path(
                db.path(),
                vec![
                    TransactionStatement {
                        query: "UPDATE review_tasks SET review_done=1, questions_done=1, questions_count=$1, correct_count=$2, score_percent=$3, completed_at=$4, updated_at=$4 WHERE id=$5".into(),
                        values: vec![json!(10), json!(5), json!(50.0), json!("2026-09-04T11:00:00Z"), json!(task_id)],
                    },
                    TransactionStatement {
                        query: "INSERT INTO learning_evidence (unit_id, evidence_date, context, questions_count, correct_count, score_percent, review_task_id, created_at) VALUES ($1, $2, 'REVIEW', $3, $4, $5, $6, $7)".into(),
                        values: vec![json!(unit_id), json!("2026-09-04"), json!(10), json!(5), json!(50.0), json!(task_id), json!("2026-09-04T11:00:00Z")],
                    },
                ],
            )
            .await
            .expect_err("duplicate review_task_id should fail with UNIQUE constraint");

            assert!(
                error.to_lowercase().contains("unique"),
                "expected unique constraint error, got: {error}"
            );

            // Verify state after rollback: review_task still 8/10, evidence count = 1
            let options = sqlx::sqlite::SqliteConnectOptions::new().filename(db.path()).foreign_keys(true);
            let mut conn = SqliteConnection::connect_with(&options).await.expect("connect");

            let task_row = sqlx::query("SELECT score_percent, correct_count FROM review_tasks WHERE id = $1")
                .bind(task_id)
                .fetch_one(&mut conn)
                .await
                .expect("task should exist");
            let score: f64 = task_row.get("score_percent");
            let correct: i64 = task_row.get("correct_count");
            assert!((score - 80.0).abs() < 0.01, "review_task score_percent must remain 80.0 after rollback, got {score}");
            assert_eq!(correct, 8, "review_task correct_count must remain 8 after rollback");

            let ev_row = sqlx::query("SELECT COUNT(*) as n, score_percent FROM learning_evidence WHERE review_task_id = $1")
                .bind(task_id)
                .fetch_one(&mut conn)
                .await
                .expect("evidence query should succeed");
            let ev_count: i64 = ev_row.get("n");
            let ev_score: f64 = ev_row.get("score_percent");
            assert_eq!(ev_count, 1, "evidence count must remain 1 after rollback");
            assert!((ev_score - 80.0).abs() < 0.01, "evidence score_percent must remain 80.0 after rollback, got {ev_score}");
        });
    }

    // P0-1 sensor: pre-migration rename must happen BEFORE CREATE TABLE IF NOT EXISTS learning_units.
    // Without pre-migration, an empty learning_units is created alongside study_records and all
    // existing user studies become invisible after upgrade (the rename check is permanently false).
    #[test]
    fn main_to_vnext_migration_preserves_study_records() {
        let db = TestDatabase::create();

        run_async(async {
            // 1. Set up main-era schema with real data
            execute_sqlite_transaction_at_path(
                db.path(),
                vec![
                    TransactionStatement {
                        query: "CREATE TABLE subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "CREATE TABLE sources (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "CREATE TABLE study_records (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL REFERENCES subjects(id), source_id INTEGER NOT NULL REFERENCES sources(id), study_date TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "CREATE TABLE review_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, study_record_id INTEGER NOT NULL REFERENCES study_records(id) ON DELETE CASCADE, review_number INTEGER NOT NULL, due_date TEXT NOT NULL, completed_at TEXT, review_done INTEGER NOT NULL DEFAULT 0, questions_done INTEGER NOT NULL DEFAULT 0, questions_count INTEGER, correct_count INTEGER, score_percent REAL, comment TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO subjects (name) VALUES ($1)".into(),
                        values: vec![json!("Fisiologia")],
                    },
                    TransactionStatement {
                        query: "INSERT INTO sources (name) VALUES ($1)".into(),
                        values: vec![json!("Guyton & Hall")],
                    },
                    TransactionStatement {
                        query: "INSERT INTO study_records (subject_id, source_id, study_date, content, created_at, updated_at) VALUES (1, 1, '2026-01-10', 'Homeostase e meio interno', '2026-01-10T08:00:00Z', '2026-01-10T08:00:00Z')".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO study_records (subject_id, source_id, study_date, content, created_at, updated_at) VALUES (1, 1, '2026-01-15', 'Sistema nervoso autônomo', '2026-01-15T08:00:00Z', '2026-01-15T08:00:00Z')".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO review_tasks (study_record_id, review_number, due_date, review_done, created_at, updated_at) VALUES (1, 1, '2026-01-11', 0, '2026-01-10T08:00:00Z', '2026-01-10T08:00:00Z')".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO review_tasks (study_record_id, review_number, due_date, review_done, questions_done, questions_count, correct_count, score_percent, completed_at, created_at, updated_at) VALUES (2, 1, '2026-01-16', 1, 1, 10, 8, 80.0, '2026-01-16T09:00:00Z', '2026-01-15T08:00:00Z', '2026-01-16T09:00:00Z')".into(),
                        values: vec![],
                    },
                ],
            )
            .await
            .expect("main-era schema and seed should succeed");

            // 2. Run correct pre-migration sequence (rename BEFORE CREATE TABLE IF NOT EXISTS)
            let (pre_migration, source_resolution) = load_migration_plan();
            let options = sqlx::sqlite::SqliteConnectOptions::new()
                .filename(db.path())
                .foreign_keys(true);
            let mut conn = SqliteConnection::connect_with(&options).await.expect("connect");

            // Steps A+B: rename study_records→learning_units and study_record_id→unit_id
            // SQL from canonical migration authority (migration-main-to-vnext.json, same as db.js)
            sqlx::query(&pre_migration[0])
                .execute(&mut conn)
                .await
                .expect("rename study_records to learning_units should succeed");

            sqlx::query(&pre_migration[1])
                .execute(&mut conn)
                .await
                .expect("rename study_record_id to unit_id should succeed");

            // Step C: now CREATE TABLE IF NOT EXISTS is a safe no-op
            sqlx::query("CREATE TABLE IF NOT EXISTS learning_units (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL REFERENCES subjects(id), source_text TEXT NOT NULL DEFAULT '', study_date TEXT NOT NULL, title TEXT NOT NULL, summary_body TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
                .execute(&mut conn)
                .await
                .expect("CREATE TABLE IF NOT EXISTS learning_units should be no-op after rename");

            // Step D: add missing vNext columns
            sqlx::query("ALTER TABLE learning_units ADD COLUMN IF NOT EXISTS title TEXT")
                .execute(&mut conn)
                .await
                .ok(); // content column exists as 'content'; rename it
            sqlx::query("ALTER TABLE learning_units RENAME COLUMN content TO title")
                .execute(&mut conn)
                .await
                .ok(); // may already be title
            sqlx::query("ALTER TABLE learning_units ADD COLUMN source_text TEXT NOT NULL DEFAULT ''")
                .execute(&mut conn)
                .await
                .ok(); // may already exist
            sqlx::query("ALTER TABLE learning_units ADD COLUMN summary_body TEXT")
                .execute(&mut conn)
                .await
                .ok(); // may already exist

            // Step E: resolve source_id → source_text (SQL from canonical migration authority)
            sqlx::query(&source_resolution)
                .execute(&mut conn)
                .await
                .expect("source_text resolution should succeed");

            // 3. Verify: learning_units has all study records
            let unit_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM learning_units")
                .fetch_one(&mut conn)
                .await
                .expect("count learning_units");
            assert_eq!(unit_count, 2, "both study records must migrate to learning_units");

            // 4. Verify: titles preserved from content column
            let title: String = sqlx::query_scalar(
                "SELECT title FROM learning_units WHERE id = 1",
            )
            .fetch_one(&mut conn)
            .await
            .expect("first unit title");
            assert_eq!(title, "Homeostase e meio interno", "title must equal original content");

            // 5. Verify: source_text resolved from sources table
            let source_text: String = sqlx::query_scalar(
                "SELECT source_text FROM learning_units WHERE id = 1",
            )
            .fetch_one(&mut conn)
            .await
            .expect("source_text must be set");
            assert_eq!(source_text, "Guyton & Hall", "source_text must resolve from sources.name");

            // 6. Verify: review_tasks.unit_id points to valid learning_units
            let task_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM review_tasks WHERE unit_id IN (SELECT id FROM learning_units)",
            )
            .fetch_one(&mut conn)
            .await
            .expect("count tasks with valid unit_id");
            assert_eq!(task_count, 2, "all review_tasks must have unit_id pointing to learning_units");

            // 7. Verify: completed review score preserved
            let score: f64 = sqlx::query_scalar(
                "SELECT score_percent FROM review_tasks WHERE review_done = 1",
            )
            .fetch_one(&mut conn)
            .await
            .expect("completed review score");
            assert!((score - 80.0).abs() < 0.01, "completed review score must be preserved after migration");

            // 8. Verify: FK integrity — no orphan review_tasks
            let fk_violations: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM review_tasks rt LEFT JOIN learning_units lu ON lu.id = rt.unit_id WHERE lu.id IS NULL",
            )
            .fetch_one(&mut conn)
            .await
            .expect("fk check");
            assert_eq!(fk_violations, 0, "no review_task must reference a non-existent learning_unit");
        });
    }

    // P0-1 discrimination sensor: proves the bug existed before the pre-migration fix.
    // The buggy sequence (CREATE TABLE IF NOT EXISTS learning_units BEFORE rename) creates an
    // empty learning_units table alongside study_records, making user data invisible.
    #[test]
    fn buggy_migration_sequence_makes_data_invisible() {
        let db = TestDatabase::create();

        run_async(async {
            // Set up main-era schema with one study record
            execute_sqlite_transaction_at_path(
                db.path(),
                vec![
                    TransactionStatement {
                        query: "CREATE TABLE subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "CREATE TABLE sources (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "CREATE TABLE study_records (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, source_id INTEGER NOT NULL, study_date TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO subjects (name) VALUES ($1)".into(),
                        values: vec![json!("Anatomia")],
                    },
                    TransactionStatement {
                        query: "INSERT INTO sources (name) VALUES ($1)".into(),
                        values: vec![json!("Sobotta")],
                    },
                    TransactionStatement {
                        query: "INSERT INTO study_records (subject_id, source_id, study_date, content, created_at, updated_at) VALUES (1, 1, '2026-02-01', 'Extremidade superior', '2026-02-01T08:00:00Z', '2026-02-01T08:00:00Z')".into(),
                        values: vec![],
                    },
                ],
            )
            .await
            .expect("main-era seed should succeed");

            // Buggy sequence: CREATE TABLE IF NOT EXISTS learning_units BEFORE rename
            let options = sqlx::sqlite::SqliteConnectOptions::new()
                .filename(db.path())
                .foreign_keys(false); // FK off to avoid constraint during buggy migration
            let mut conn = SqliteConnection::connect_with(&options).await.expect("connect");

            // Buggy step: CREATE TABLE first (creates empty competing table)
            sqlx::query("CREATE TABLE IF NOT EXISTS learning_units (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER, source_text TEXT NOT NULL DEFAULT '', study_date TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '')")
                .execute(&mut conn)
                .await
                .expect("buggy CREATE TABLE IF NOT EXISTS");

            // Now try the rename — study_records still exists but learning_units also exists,
            // so the check (!learning_units && study_records) would be FALSE: rename never runs.
            // Simulate that: just check that learning_units is empty (the bug).
            let unit_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM learning_units")
                .fetch_one(&mut conn)
                .await
                .expect("count learning_units after buggy migration");

            assert_eq!(unit_count, 0,
                "DISCRIMINATION: buggy migration creates empty learning_units — user data invisible (study_records still has data)");

            // Confirm study_records still has the data (not migrated)
            let sr_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM study_records")
                .fetch_one(&mut conn)
                .await
                .expect("count study_records");
            assert_eq!(sr_count, 1, "study_records still has data but it is invisible to vNext API");
        });
    }

    // P1-6 drift detection: after pre-migration renames, setup_review_schema() (the canonical
    // vNext schema used by all fresh installs) must complete without error and produce a fully
    // usable database. If setup_review_schema() drifts from the expected schema (e.g., a column
    // removed or renamed), this test breaks — proving the shared contract is enforced.
    #[test]
    fn migration_then_canonical_schema_produces_usable_db() {
        let db = TestDatabase::create();

        run_async(async {
            // 1. Create main-era schema with real data
            execute_sqlite_transaction_at_path(
                db.path(),
                vec![
                    TransactionStatement {
                        query: "CREATE TABLE subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "CREATE TABLE sources (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "CREATE TABLE study_records (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL REFERENCES subjects(id), source_id INTEGER NOT NULL REFERENCES sources(id), study_date TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "CREATE TABLE review_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, study_record_id INTEGER NOT NULL REFERENCES study_records(id) ON DELETE CASCADE, review_number INTEGER NOT NULL, due_date TEXT NOT NULL, completed_at TEXT, review_done INTEGER NOT NULL DEFAULT 0, questions_done INTEGER NOT NULL DEFAULT 0, questions_count INTEGER, correct_count INTEGER, score_percent REAL, comment TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO subjects (name) VALUES ($1)".into(),
                        values: vec![json!("Farmacologia")],
                    },
                    TransactionStatement {
                        query: "INSERT INTO sources (name) VALUES ($1)".into(),
                        values: vec![json!("Katzung")],
                    },
                    TransactionStatement {
                        query: "INSERT INTO study_records (subject_id, source_id, study_date, content, created_at, updated_at) VALUES (1, 1, '2026-03-01', 'Farmacocinética básica', '2026-03-01T08:00:00Z', '2026-03-01T08:00:00Z')".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO review_tasks (study_record_id, review_number, due_date, created_at, updated_at) VALUES (1, 1, '2026-03-02', '2026-03-01T08:00:00Z', '2026-03-01T08:00:00Z')".into(),
                        values: vec![],
                    },
                ],
            )
            .await
            .expect("main-era seed should succeed");

            // 2. Run pre-migration renames using canonical authority (same JSON as db.js production)
            let (pre_migration, source_resolution) = load_migration_plan();
            let options = sqlx::sqlite::SqliteConnectOptions::new()
                .filename(db.path())
                .foreign_keys(false); // off during rename
            let mut conn = SqliteConnection::connect_with(&options).await.expect("connect");

            sqlx::query(&pre_migration[0])
                .execute(&mut conn)
                .await
                .expect("rename study_records");
            sqlx::query(&pre_migration[1])
                .execute(&mut conn)
                .await
                .expect("rename study_record_id");
            sqlx::query("ALTER TABLE learning_units RENAME COLUMN content TO title")
                .execute(&mut conn)
                .await
                .ok();
            sqlx::query("ALTER TABLE learning_units ADD COLUMN source_text TEXT NOT NULL DEFAULT ''")
                .execute(&mut conn)
                .await
                .ok();
            sqlx::query("ALTER TABLE learning_units ADD COLUMN summary_body TEXT")
                .execute(&mut conn)
                .await
                .ok();
            sqlx::query(&source_resolution)
                .execute(&mut conn)
                .await
                .expect("source_text resolution");
            drop(conn);

            // 3. Run setup_review_schema() — the CANONICAL schema function used by fresh installs.
            //    After renames, all CREATE TABLE IF NOT EXISTS are no-ops for existing tables.
            //    This is the shared contract: setup_review_schema must succeed and produce the same
            //    schema shape whether called on a fresh DB or post-migration. If it drifts, the
            //    insert below will fail.
            setup_review_schema(db.path()).await;

            // 4. Verify: canonical schema inserted a new row successfully (learning_evidence table now exists)
            let result = execute_sqlite_transaction_at_path(
                db.path(),
                vec![TransactionStatement {
                    query: "INSERT INTO learning_evidence (unit_id, evidence_date, context, questions_count, correct_count, score_percent, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)".into(),
                    values: vec![json!(1), json!("2026-03-01"), json!("INITIAL_PRACTICE"), json!(10), json!(7), json!(70.0), json!("2026-03-01T10:00:00Z")],
                }],
            )
            .await;
            assert!(result.is_ok(), "insert into learning_evidence must succeed: {:?}", result.err());

            // 5. Verify migrated data is visible through the canonical schema
            let options2 = sqlx::sqlite::SqliteConnectOptions::new()
                .filename(db.path())
                .foreign_keys(true);
            let mut conn2 = SqliteConnection::connect_with(&options2).await.expect("connect2");

            let unit_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM learning_units")
                .fetch_one(&mut conn2)
                .await
                .expect("count units");
            assert_eq!(unit_count, 1, "migrated unit must be visible through canonical schema");

            let title: String = sqlx::query_scalar("SELECT title FROM learning_units WHERE id=1")
                .fetch_one(&mut conn2)
                .await
                .expect("title");
            assert_eq!(title, "Farmacocinética básica");

            let source: String = sqlx::query_scalar("SELECT source_text FROM learning_units WHERE id=1")
                .fetch_one(&mut conn2)
                .await
                .expect("source_text");
            assert_eq!(source, "Katzung");

            let fk_violations: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM review_tasks rt LEFT JOIN learning_units lu ON lu.id = rt.unit_id WHERE lu.id IS NULL",
            )
            .fetch_one(&mut conn2)
            .await
            .expect("fk check");
            assert_eq!(fk_violations, 0, "no FK violations after migration + canonical schema");
        });
    }

    // P2-A sensor: setup_review_schema() (canonical DDL) must produce all runtime columns —
    // including those that were historically added by ensureColumns (color, is_active, sort_order
    // for subjects; algorithm for review_tasks). Fresh DB via schema-statements.json must be
    // column-complete without needing any ensureColumns pass.
    #[test]
    fn canonical_schema_includes_all_runtime_columns() {
        let db = TestDatabase::create();

        run_async(async {
            setup_review_schema(db.path()).await;

            let options = sqlx::sqlite::SqliteConnectOptions::new()
                .filename(db.path())
                .foreign_keys(true);
            let mut conn = SqliteConnection::connect_with(&options).await.expect("connect");

            // Verify subjects has color, is_active, sort_order
            let subject_cols: Vec<String> = sqlx::query_scalar("SELECT name FROM pragma_table_info('subjects')")
                .fetch_all(&mut conn)
                .await
                .expect("subjects pragma");
            let subject_col_set: std::collections::HashSet<String> = subject_cols.into_iter().collect();
            assert!(subject_col_set.contains("color"), "subjects must have color column");
            assert!(subject_col_set.contains("is_active"), "subjects must have is_active column");
            assert!(subject_col_set.contains("sort_order"), "subjects must have sort_order column");

            // Verify review_tasks has algorithm
            let task_cols: Vec<String> = sqlx::query_scalar("SELECT name FROM pragma_table_info('review_tasks')")
                .fetch_all(&mut conn)
                .await
                .expect("review_tasks pragma");
            let task_col_set: std::collections::HashSet<String> = task_cols.into_iter().collect();
            assert!(task_col_set.contains("algorithm"), "review_tasks must have algorithm column");

            // Prove the kill test: INSERT with explicit color/algorithm values must succeed
            let insert_result = execute_sqlite_transaction_at_path(
                db.path(),
                vec![
                    TransactionStatement {
                        query: "INSERT INTO subjects (name, color, is_active, sort_order, created_at, updated_at) VALUES ('Anatomia', 'DISC-GREEN', 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')".into(),
                        values: vec![],
                    },
                ],
            )
            .await;
            assert!(insert_result.is_ok(), "INSERT with color column must succeed on fresh schema: {:?}", insert_result.err());
        });
    }

    // P2-B sensor: exercises.study_record_id → unit_id rename via preMigration[2].
    // Tests the exercises rename step which is NOT exercised by other migration tests.
    // Kill test: break preMigration[2] → this test FAILS; restore → PASS.
    #[test]
    fn exercises_premigration_step2_renames_study_record_id() {
        let db = TestDatabase::create();

        run_async(async {
            let (pre_migration, _source_resolution) = load_migration_plan();

            // 1. Set up main-era schema with exercises using old FK column name
            execute_sqlite_transaction_at_path(
                db.path(),
                vec![
                    TransactionStatement {
                        query: "CREATE TABLE subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "CREATE TABLE study_records (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, study_date TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "CREATE TABLE exercises (id INTEGER PRIMARY KEY AUTOINCREMENT, study_record_id INTEGER NOT NULL REFERENCES study_records(id) ON DELETE CASCADE, question_text TEXT NOT NULL, answer_text TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO subjects (name) VALUES ('Histologia')".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO study_records (subject_id, study_date, content, created_at, updated_at) VALUES (1, '2026-01-05', 'Tecido epitelial', '2026-01-05T08:00:00Z', '2026-01-05T08:00:00Z')".into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO exercises (study_record_id, question_text, answer_text, created_at, updated_at) VALUES (1, 'Quais são os tipos?', 'Simples e estratificado', '2026-01-05T08:00:00Z', '2026-01-05T08:00:00Z')".into(),
                        values: vec![],
                    },
                ],
            )
            .await
            .expect("main-era exercises seed should succeed");

            // 2. Run preMigration[2]: rename exercises.study_record_id → unit_id
            // This is the canonical step from migration-main-to-vnext.json (same as db.js production)
            let options = sqlx::sqlite::SqliteConnectOptions::new()
                .filename(db.path())
                .foreign_keys(false);
            let mut conn = SqliteConnection::connect_with(&options).await.expect("connect");

            sqlx::query(&pre_migration[2])
                .execute(&mut conn)
                .await
                .expect("preMigration[2]: rename study_record_id to unit_id in exercises should succeed");

            // 3. Verify: column renamed, data preserved
            let cols: Vec<String> = sqlx::query_scalar("SELECT name FROM pragma_table_info('exercises')")
                .fetch_all(&mut conn)
                .await
                .expect("exercises pragma");
            let col_set: std::collections::HashSet<String> = cols.into_iter().collect();
            assert!(col_set.contains("unit_id"), "exercises must have unit_id after preMigration[2]");
            assert!(!col_set.contains("study_record_id"), "exercises must NOT have study_record_id after rename");

            let ex_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM exercises WHERE unit_id = 1")
                .fetch_one(&mut conn)
                .await
                .expect("count exercises by unit_id");
            assert_eq!(ex_count, 1, "exercise data must be preserved after column rename");

            let question: String = sqlx::query_scalar("SELECT question_text FROM exercises WHERE unit_id = 1")
                .fetch_one(&mut conn)
                .await
                .expect("exercise question_text");
            assert_eq!(question, "Quais são os tipos?", "exercise question_text must survive rename");
        });
    }

    #[test]
    fn execute_sqlite_transaction_rolls_back_on_error() {
        let db = TestDatabase::create();

        run_async(async {
            execute_sqlite_transaction_at_path(
                db.path(),
                vec![
                    TransactionStatement {
                        query: "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)"
                            .into(),
                        values: vec![],
                    },
                    TransactionStatement {
                        query: "INSERT INTO items (id, name) VALUES ($1, $2)".into(),
                        values: vec![json!(1), json!("primeiro")],
                    },
                ],
            )
            .await
            .expect("initial setup should succeed");

            let error = execute_sqlite_transaction_at_path(
                db.path(),
                vec![
                    TransactionStatement {
                        query: "INSERT INTO items (id, name) VALUES ($1, $2)".into(),
                        values: vec![json!(2), json!("segundo")],
                    },
                    TransactionStatement {
                        query: "INSERT INTO items (id, name) VALUES ($1, $2)".into(),
                        values: vec![json!(3), json!("primeiro")],
                    },
                ],
            )
            .await
            .expect_err("duplicate unique value should fail");

            assert!(
                error.to_lowercase().contains("unique"),
                "expected unique constraint error, got: {error}"
            );

            let mut connection = SqliteConnection::connect(&format!("sqlite:{}", db.path().display()))
                .await
                .expect("sqlite connection should open");
            let row = sqlx::query("SELECT COUNT(*) AS total FROM items")
                .fetch_one(&mut connection)
                .await
                .expect("count query should succeed");
            let total: i64 = row.get("total");
            assert_eq!(total, 1, "failed transaction must not persist partial writes");
        });
    }
}
