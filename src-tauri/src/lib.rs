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
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("smartlearn.db");
    execute_sqlite_transaction_at_path(&database_path, statements).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
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
