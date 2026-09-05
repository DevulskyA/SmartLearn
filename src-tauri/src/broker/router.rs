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
        .layer(axum::extract::DefaultBodyLimit::max(1_048_576))
        .layer(cors)
        .with_state(state)
}
