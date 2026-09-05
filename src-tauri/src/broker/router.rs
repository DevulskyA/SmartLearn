use axum::{
    Router,
    extract::{Json, State},
    http::{HeaderValue, Method, StatusCode, header},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::Value;
use sqlx::{Column, Row, SqlitePool};
use tower_http::cors::{AllowOrigin, CorsLayer};

const MAX_TRANSACTION_STATEMENTS: usize = 100;

#[derive(Clone)]
pub struct BrokerState {
    pub pool: SqlitePool,
}

#[derive(Deserialize)]
struct QueryRequest {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

#[derive(Deserialize)]
struct StatementRequest {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

#[derive(Deserialize)]
struct TransactionRequest {
    statements: Vec<StatementRequest>,
}

fn row_to_json(row: &sqlx::sqlite::SqliteRow) -> Value {
    let cols = row.columns();
    let mut obj = serde_json::Map::new();
    for col in cols {
        let name = col.name().to_string();
        let ord = col.ordinal();
        // Waterfall: NULL fails all try_get → Value::Null; INTEGER beats REAL beats TEXT
        let val = if let Ok(v) = row.try_get::<i64, _>(ord) {
            Value::Number(v.into())
        } else if let Ok(v) = row.try_get::<f64, _>(ord) {
            serde_json::Number::from_f64(v).map(Value::Number).unwrap_or(Value::Null)
        } else if let Ok(v) = row.try_get::<String, _>(ord) {
            Value::String(v)
        } else {
            Value::Null
        };
        obj.insert(name, val);
    }
    Value::Object(obj)
}

/// Bind a Vec<Value> of JSON params to a sqlx query, matching the same
/// type coercion used by execute_sqlite_transaction.
macro_rules! bind_params {
    ($query:expr, $params:expr) => {{
        let mut q = $query;
        for p in $params {
            q = match p {
                Value::Null => q.bind(None::<String>),
                Value::Bool(v) => q.bind(v),
                Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        q.bind(i)
                    } else if let Some(u) = n.as_u64() {
                        q.bind(u as i64)
                    } else {
                        q.bind(n.as_f64().unwrap_or_default())
                    }
                }
                Value::String(s) => q.bind(s),
                v => q.bind(v.to_string()),
            };
        }
        q
    }};
}

async fn health_handler() -> (StatusCode, Json<Value>) {
    (StatusCode::OK, Json(serde_json::json!({"ok": true})))
}

async fn query_handler(
    State(state): State<BrokerState>,
    Json(req): Json<QueryRequest>,
) -> (StatusCode, Json<Value>) {
    let QueryRequest { sql, params } = req;
    let q = bind_params!(sqlx::query(&sql), params);
    match q.fetch_all(&state.pool).await {
        Ok(rows) => {
            let rows: Vec<Value> = rows.iter().map(row_to_json).collect();
            (StatusCode::OK, Json(serde_json::json!({"rows": rows})))
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": e.to_string()}))),
    }
}

async fn execute_handler(
    State(state): State<BrokerState>,
    Json(req): Json<QueryRequest>,
) -> (StatusCode, Json<Value>) {
    let QueryRequest { sql, params } = req;
    let q = bind_params!(sqlx::query(&sql), params);
    match q.execute(&state.pool).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::json!({
            "rows_affected": r.rows_affected(),
            "last_insert_id": r.last_insert_rowid(),
        }))),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": e.to_string()}))),
    }
}

async fn transaction_handler(
    State(state): State<BrokerState>,
    Json(req): Json<TransactionRequest>,
) -> (StatusCode, Json<Value>) {
    if req.statements.len() > MAX_TRANSACTION_STATEMENTS {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!("too many statements: max {MAX_TRANSACTION_STATEMENTS}")
            })),
        );
    }
    let mut tx = match state.pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": e.to_string()})),
            )
        }
    };
    let mut results: Vec<Value> = Vec::with_capacity(req.statements.len());
    for stmt in req.statements {
        let StatementRequest { sql, params } = stmt;
        let q = bind_params!(sqlx::query(&sql), params);
        match q.execute(&mut *tx).await {
            Ok(r) => results.push(serde_json::json!({
                "rows_affected": r.rows_affected(),
                "last_insert_id": r.last_insert_rowid(),
            })),
            Err(e) => {
                let _ = tx.rollback().await;
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({"error": e.to_string()})),
                );
            }
        }
    }
    match tx.commit().await {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({"results": results}))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        ),
    }
}

async fn schema_handler(State(state): State<BrokerState>) -> (StatusCode, Json<Value>) {
    match sqlx::query("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name")
        .fetch_all(&state.pool)
        .await
    {
        Ok(rows) => {
            let tables: Vec<Value> = rows
                .iter()
                .map(|row| {
                    let name = row.try_get::<String, _>(0).unwrap_or_default();
                    let ddl = row.try_get::<Option<String>, _>(1).ok().flatten();
                    serde_json::json!({"name": name, "sql": ddl})
                })
                .collect();
            (StatusCode::OK, Json(serde_json::json!({"tables": tables})))
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        ),
    }
}

async fn migrate_import_handler(
    State(state): State<BrokerState>,
    Json(req): Json<TransactionRequest>,
) -> (StatusCode, Json<Value>) {
    let mut tx = match state.pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": e.to_string()})),
            )
        }
    };
    // Validate: all statements must be INSERT/CREATE/PRAGMA (no DROP/DELETE/UPDATE/TRUNCATE).
    for stmt in &req.statements {
        let upper = stmt.sql.trim_start().to_uppercase();
        let allowed = upper.starts_with("INSERT")
            || upper.starts_with("CREATE")
            || upper.starts_with("PRAGMA");
        if !allowed {
            let _ = tx.rollback().await;
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": format!("migrate/import only allows INSERT/CREATE/PRAGMA; rejected: {}", stmt.sql.chars().take(60).collect::<String>())})),
            );
        }
    }
    let mut count: u64 = 0;
    for stmt in req.statements {
        let StatementRequest { sql, params } = stmt;
        let q = bind_params!(sqlx::query(&sql), params);
        match q.execute(&mut *tx).await {
            Ok(r) => count += r.rows_affected(),
            Err(e) => {
                let _ = tx.rollback().await;
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({"error": e.to_string()})),
                );
            }
        }
    }
    match tx.commit().await {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({"rows_affected": count}))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        ),
    }
}

pub fn build_router(pool: SqlitePool) -> Router {
    let state = BrokerState { pool };
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin: &HeaderValue, _| {
            origin
                .to_str()
                .map(|s| {
                    s.starts_with("http://localhost")
                        || s == "tauri://localhost"
                        || s.starts_with("https://tauri.localhost")
                })
                .unwrap_or(false)
        }))
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE]);
    Router::new()
        .route("/api/health", get(health_handler))
        .route("/api/query", post(query_handler))
        .route("/api/execute", post(execute_handler))
        .route("/api/transaction", post(transaction_handler))
        .route("/api/schema", get(schema_handler))
        .route("/api/migrate/import", post(migrate_import_handler))
        .layer(axum::extract::DefaultBodyLimit::max(16_777_216)) // 16 MB for import payloads
        .layer(cors)
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::broker::db::{enable_wal, open_pool};
    use axum::{
        body::Body,
        http::{Method, Request, StatusCode},
    };
    use std::{fs, time::{SystemTime, UNIX_EPOCH}};
    use tower::ServiceExt;

    struct TempDb {
        path: std::path::PathBuf,
    }
    impl TempDb {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos();
            let path =
                std::env::temp_dir().join(format!("smartlearn-router-test-{unique}.db"));
            Self { path }
        }
    }
    impl Drop for TempDb {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.path);
            let _ = fs::remove_file(self.path.with_extension("db-wal"));
            let _ = fs::remove_file(self.path.with_extension("db-shm"));
        }
    }

    fn run_async<T>(f: impl std::future::Future<Output = T>) -> T {
        tauri::async_runtime::block_on(f)
    }

    async fn setup(db: &TempDb) -> (Router, SqlitePool) {
        let pool = open_pool(&db.path).await.expect("open pool");
        enable_wal(&pool).await.expect("enable WAL");
        let router = build_router(pool.clone());
        (router, pool)
    }

    fn json_body(v: &Value) -> Body {
        Body::from(v.to_string())
    }

    fn post_json(uri: &str, body: Value) -> Request<Body> {
        Request::builder()
            .method(Method::POST)
            .uri(uri)
            .header("content-type", "application/json")
            .body(json_body(&body))
            .unwrap()
    }

    async fn response_json(resp: axum::response::Response) -> Value {
        let bytes =
            axum::body::to_bytes(resp.into_body(), 65_536).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[test]
    fn health_returns_ok() {
        let db = TempDb::new();
        run_async(async {
            let (router, _) = setup(&db).await;
            let req = Request::builder()
                .method(Method::GET)
                .uri("/api/health")
                .body(Body::empty())
                .unwrap();
            let resp = router.oneshot(req).await.unwrap();
            assert_eq!(resp.status(), StatusCode::OK);
            let body = response_json(resp).await;
            assert_eq!(body["ok"], Value::Bool(true));
        });
    }

    #[test]
    fn transaction_write_then_query_read() {
        let db = TempDb::new();
        run_async(async {
            let (router, pool) = setup(&db).await;
            let txn_req = post_json(
                "/api/transaction",
                serde_json::json!({
                    "statements": [
                        {"sql": "CREATE TABLE t (v TEXT)", "params": []},
                        {"sql": "INSERT INTO t VALUES (?)", "params": ["broker-test"]}
                    ]
                }),
            );
            let resp = router.oneshot(txn_req).await.unwrap();
            assert_eq!(resp.status(), StatusCode::OK, "transaction failed");

            let router2 = build_router(pool.clone());
            let query_req = post_json(
                "/api/query",
                serde_json::json!({"sql": "SELECT v FROM t", "params": []}),
            );
            let resp = router2.oneshot(query_req).await.unwrap();
            assert_eq!(resp.status(), StatusCode::OK);
            let body = response_json(resp).await;
            assert_eq!(body["rows"][0]["v"], Value::String("broker-test".into()));
        });
    }

    #[test]
    fn transaction_rollback_on_bad_sql() {
        let db = TempDb::new();
        run_async(async {
            let (router, pool) = setup(&db).await;
            // Create table first
            let setup_req = post_json(
                "/api/transaction",
                serde_json::json!({
                    "statements": [{"sql": "CREATE TABLE t (v TEXT)", "params": []}]
                }),
            );
            let _ = router.oneshot(setup_req).await.unwrap();

            // Transaction with valid INSERT then invalid SQL → rollback
            let router2 = build_router(pool.clone());
            let bad_req = post_json(
                "/api/transaction",
                serde_json::json!({
                    "statements": [
                        {"sql": "INSERT INTO t VALUES (?)", "params": ["should-not-persist"]},
                        {"sql": "THIS IS NOT SQL", "params": []}
                    ]
                }),
            );
            let resp = router2.oneshot(bad_req).await.unwrap();
            assert_eq!(resp.status(), StatusCode::BAD_REQUEST, "bad SQL must be rejected");

            // Row must NOT be in DB after rollback
            let router3 = build_router(pool.clone());
            let query_req = post_json(
                "/api/query",
                serde_json::json!({"sql": "SELECT COUNT(*) AS n FROM t", "params": []}),
            );
            let resp = router3.oneshot(query_req).await.unwrap();
            let body = response_json(resp).await;
            assert_eq!(body["rows"][0]["n"], Value::Number(0.into()), "rolled-back row must not persist");
        });
    }

    #[test]
    fn transaction_rejects_over_100_statements() {
        let db = TempDb::new();
        run_async(async {
            let (router, _) = setup(&db).await;
            let stmts: Vec<Value> = (0..=MAX_TRANSACTION_STATEMENTS)
                .map(|_| serde_json::json!({"sql": "SELECT 1", "params": []}))
                .collect();
            let req = post_json(
                "/api/transaction",
                serde_json::json!({"statements": stmts}),
            );
            let resp = router.oneshot(req).await.unwrap();
            assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
            let body = response_json(resp).await;
            assert!(body["error"].as_str().unwrap_or("").contains("too many statements"));
        });
    }

    #[test]
    fn concurrent_reads_succeed_during_write() {
        let db = TempDb::new();
        run_async(async {
            let pool = open_pool(&db.path).await.expect("open pool");
            enable_wal(&pool).await.expect("enable WAL");
            sqlx::query("CREATE TABLE t (v INTEGER)")
                .execute(&pool)
                .await
                .expect("create table");
            // 4 concurrent readers while 1 writer runs
            let mut handles = Vec::new();
            for i in 0..4_i64 {
                let pool = pool.clone();
                handles.push(tauri::async_runtime::spawn(async move {
                    sqlx::query("SELECT ? AS v")
                        .bind(i)
                        .fetch_one(&pool)
                        .await
                        .is_ok()
                }));
            }
            // Writer inserts concurrently
            let pool2 = pool.clone();
            let write_ok = tauri::async_runtime::spawn(async move {
                sqlx::query("INSERT INTO t VALUES (999)")
                    .execute(&pool2)
                    .await
                    .is_ok()
            });
            for h in handles {
                assert!(h.await.expect("reader task"), "concurrent read must succeed");
            }
            assert!(write_ok.await.expect("writer task"), "concurrent write must succeed");
        });
    }

    #[test]
    fn migrate_import_inserts_rows_atomically() {
        let db = TempDb::new();
        run_async(async {
            let (router, pool) = setup(&db).await;
            let req = post_json(
                "/api/migrate/import",
                serde_json::json!({
                    "statements": [
                        {"sql": "CREATE TABLE m (v TEXT)", "params": []},
                        {"sql": "INSERT INTO m VALUES (?)", "params": ["a"]},
                        {"sql": "INSERT INTO m VALUES (?)", "params": ["b"]}
                    ]
                }),
            );
            let resp = router.oneshot(req).await.unwrap();
            assert_eq!(resp.status(), StatusCode::OK);
            let body = response_json(resp).await;
            assert_eq!(body["rows_affected"], Value::Number(2.into()));

            let router2 = build_router(pool);
            let resp = router2.oneshot(post_json("/api/query", serde_json::json!({"sql": "SELECT COUNT(*) AS n FROM m", "params": []}))).await.unwrap();
            let body = response_json(resp).await;
            assert_eq!(body["rows"][0]["n"], Value::Number(2.into()));
        });
    }

    #[test]
    fn migrate_import_rejects_delete_statement() {
        let db = TempDb::new();
        run_async(async {
            let (router, _) = setup(&db).await;
            let req = post_json(
                "/api/migrate/import",
                serde_json::json!({
                    "statements": [{"sql": "DELETE FROM anything", "params": []}]
                }),
            );
            let resp = router.oneshot(req).await.unwrap();
            assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
            let body = response_json(resp).await;
            assert!(body["error"].as_str().unwrap_or("").contains("INSERT/CREATE/PRAGMA"));
        });
    }

    #[test]
    fn execute_write_returns_rows_affected() {
        let db = TempDb::new();
        run_async(async {
            let (router, pool) = setup(&db).await;
            sqlx::query("CREATE TABLE ex (v TEXT);")
                .execute(&pool)
                .await
                .unwrap();
            let router2 = build_router(pool);
            let req = post_json(
                "/api/execute",
                serde_json::json!({"sql": "INSERT INTO ex VALUES (?)", "params": ["hello"]}),
            );
            let resp = router2.oneshot(req).await.unwrap();
            assert_eq!(resp.status(), StatusCode::OK);
            let body = response_json(resp).await;
            assert_eq!(body["rows_affected"], Value::Number(1.into()));
        });
    }

    #[test]
    fn execute_bad_sql_returns_400() {
        let db = TempDb::new();
        run_async(async {
            let (router, _) = setup(&db).await;
            let req = post_json(
                "/api/execute",
                serde_json::json!({"sql": "NOT VALID SQL !!!", "params": []}),
            );
            let resp = router.oneshot(req).await.unwrap();
            assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
            let body = response_json(resp).await;
            assert!(body["error"].is_string());
        });
    }

    #[test]
    fn schema_returns_tables_list() {
        let db = TempDb::new();
        run_async(async {
            let (router, pool) = setup(&db).await;
            sqlx::query("CREATE TABLE schema_test (id INTEGER PRIMARY KEY);")
                .execute(&pool)
                .await
                .unwrap();
            let router2 = build_router(pool);
            let req = axum::http::Request::builder()
                .method("GET")
                .uri("/api/schema")
                .body(axum::body::Body::empty())
                .unwrap();
            let resp = router2.oneshot(req).await.unwrap();
            assert_eq!(resp.status(), StatusCode::OK);
            let body = response_json(resp).await;
            let tables = body["tables"].as_array().expect("tables array");
            let names: Vec<&str> = tables
                .iter()
                .filter_map(|t| t["name"].as_str())
                .collect();
            assert!(names.contains(&"schema_test"), "schema_test must appear in tables list");
        });
    }
}
