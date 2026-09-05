use sqlx::{Pool, Sqlite, SqlitePool, sqlite::SqliteConnectOptions};
use std::path::Path;

pub async fn open_pool(db_path: &Path) -> Result<Pool<Sqlite>, sqlx::Error> {
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .foreign_keys(true);
    SqlitePool::connect_with(options).await
}

pub async fn enable_wal(pool: &Pool<Sqlite>) -> Result<(), sqlx::Error> {
    sqlx::query("PRAGMA journal_mode=WAL;").execute(pool).await?;
    sqlx::query("PRAGMA synchronous=NORMAL;").execute(pool).await?;
    sqlx::query("PRAGMA wal_autocheckpoint=1000;").execute(pool).await?;
    Ok(())
}

/// VACUUM INTO copies the live database to dest as a clean, single-file snapshot.
/// Path must not contain single quotes (no parameter binding for VACUUM INTO in SQLite).
pub async fn backup(pool: &Pool<Sqlite>, dest: &Path) -> Result<(), sqlx::Error> {
    let dest_str = dest.to_string_lossy();
    if dest_str.contains('\'') {
        return Err(sqlx::Error::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "backup path must not contain single quotes",
        )));
    }
    sqlx::query(&format!("VACUUM INTO '{dest_str}'"))
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Row;
    use std::{fs, time::{SystemTime, UNIX_EPOCH}};

    struct TempDb {
        path: std::path::PathBuf,
    }

    impl TempDb {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock after unix epoch")
                .as_nanos();
            let path = std::env::temp_dir()
                .join(format!("smartlearn-broker-test-{unique}.db"));
            Self { path }
        }
    }

    impl Drop for TempDb {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.path);
            let wal = self.path.with_extension("db-wal");
            let shm = self.path.with_extension("db-shm");
            let _ = fs::remove_file(wal);
            let _ = fs::remove_file(shm);
        }
    }

    fn run_async<T>(future: impl std::future::Future<Output = T>) -> T {
        tauri::async_runtime::block_on(future)
    }

    #[test]
    fn open_pool_and_enable_wal_verified_via_pragma() {
        let db = TempDb::new();
        run_async(async {
            let pool = open_pool(&db.path).await.expect("pool should open");
            enable_wal(&pool).await.expect("WAL should enable");
            let row = sqlx::query("PRAGMA journal_mode")
                .fetch_one(&pool)
                .await
                .expect("pragma query should succeed");
            let mode: String = row.try_get(0).expect("journal_mode column");
            assert_eq!(mode, "wal", "journal_mode must be wal after enable_wal");
        });
    }

    #[test]
    fn backup_creates_clean_copy() {
        let db = TempDb::new();
        let backup_db = TempDb::new();
        run_async(async {
            let pool = open_pool(&db.path).await.expect("pool should open");
            enable_wal(&pool).await.expect("WAL should enable");
            sqlx::query("CREATE TABLE t (v TEXT);")
                .execute(&pool)
                .await
                .expect("create table");
            sqlx::query("INSERT INTO t VALUES ('hello');")
                .execute(&pool)
                .await
                .expect("insert");
            backup(&pool, &backup_db.path).await.expect("backup should succeed");
            // Verify backup readable with expected data
            let backup_pool = open_pool(&backup_db.path).await.expect("backup pool");
            let row = sqlx::query("SELECT v FROM t")
                .fetch_one(&backup_pool)
                .await
                .expect("backup row");
            let v: String = row.try_get(0).expect("value");
            assert_eq!(v, "hello");
        });
    }
}
