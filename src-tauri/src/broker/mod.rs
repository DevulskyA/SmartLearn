pub mod db;
pub mod router;

use sqlx::SqlitePool;
use std::path::PathBuf;

/// Keeps the broker alive. Stored in Tauri managed state for the app lifetime.
pub struct BrokerHandle {
    pub pool: SqlitePool,
}

/// Opens the SQLite pool, enables WAL, starts the axum HTTP server on 127.0.0.1:57321.
/// On port-in-use error, logs a warning and returns Err — the app continues without broker.
pub async fn start_broker(app_data_dir: PathBuf) -> Result<BrokerHandle, String> {
    let db_path = app_data_dir.join("smartlearn.db");
    let pool = db::open_pool(&db_path).await.map_err(|e| e.to_string())?;
    db::enable_wal(&pool).await.map_err(|e| e.to_string())?;
    let http_router = router::build_router(pool.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:57321")
        .await
        .map_err(|e| format!("broker port 57321 unavailable: {e}"))?;
    // Detach the serve task — dropping JoinHandle does NOT abort it in tokio.
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, http_router).await {
            log::error!("broker HTTP server stopped: {e}");
        }
    });
    log::info!("broker listening on http://127.0.0.1:57321");
    Ok(BrokerHandle { pool })
}
