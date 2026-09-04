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

    // Full schema for completeReviewWithEvidence tests — matches db.js schemaStatements.
    async fn setup_review_schema(db: &Path) {
        let stmts: Vec<TransactionStatement> = vec![
            "CREATE TABLE IF NOT EXISTS subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)",
            "CREATE TABLE IF NOT EXISTS learning_units (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL REFERENCES subjects(id), source_text TEXT NOT NULL DEFAULT '', study_date TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS review_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, unit_id INTEGER NOT NULL REFERENCES learning_units(id) ON DELETE CASCADE, review_number INTEGER NOT NULL, due_date TEXT NOT NULL, completed_at TEXT, review_done INTEGER NOT NULL DEFAULT 0, questions_done INTEGER NOT NULL DEFAULT 0, questions_count INTEGER, correct_count INTEGER, score_percent REAL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS learning_evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, unit_id INTEGER NOT NULL REFERENCES learning_units(id), evidence_date TEXT NOT NULL, context TEXT NOT NULL CHECK(context IN ('INITIAL_PRACTICE','REVIEW','EXTERNAL')), questions_count INTEGER NOT NULL CHECK(questions_count > 0), correct_count INTEGER NOT NULL CHECK(correct_count >= 0), score_percent REAL, review_task_id INTEGER REFERENCES review_tasks(id), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))",
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_le_review_task ON learning_evidence(review_task_id) WHERE review_task_id IS NOT NULL",
        ].iter().map(|sql| TransactionStatement { query: sql.to_string(), values: vec![] }).collect();
        execute_sqlite_transaction_at_path(db, stmts).await.expect("review schema should succeed");
    }

    async fn seed_review_data(db: &Path) -> (i64, i64, i64) {
        execute_sqlite_transaction_at_path(
            db,
            vec![
                TransactionStatement {
                    query: "INSERT INTO subjects (name) VALUES ($1)".into(),
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
