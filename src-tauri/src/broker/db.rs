use sqlx::{Pool, Sqlite, SqlitePool, sqlite::SqliteConnectOptions};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

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

/// Remove backup files older than `keep_days` from `backup_dir` matching `smartlearn-backup-*.db`.
pub fn rotate_backups(backup_dir: &Path, keep_days: u64) -> std::io::Result<usize> {
    let cutoff = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .saturating_sub(keep_days * 86_400);

    let mut removed = 0usize;
    let entries = std::fs::read_dir(backup_dir)?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if !name.starts_with("smartlearn-backup-") || !name.ends_with(".db") {
            continue;
        }
        // Parse unix timestamp from filename: smartlearn-backup-<ts>.db
        if let Some(ts_str) = name
            .strip_prefix("smartlearn-backup-")
            .and_then(|s| s.strip_suffix(".db"))
        {
            if let Ok(ts) = ts_str.parse::<u64>() {
                if ts < cutoff {
                    let _ = std::fs::remove_file(&path);
                    removed += 1;
                }
            }
        }
    }
    Ok(removed)
}

/// Take a backup into `backup_dir` then prune files older than 30 days.
pub async fn startup_backup(pool: &Pool<Sqlite>, backup_dir: PathBuf) -> Result<PathBuf, String> {
    std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let dest = backup_dir.join(format!("smartlearn-backup-{ts}.db"));
    // VACUUM INTO fails if the destination already exists — skip if same-second double call.
    if dest.exists() {
        return Ok(dest);
    }
    backup(pool, &dest).await.map_err(|e| e.to_string())?;
    rotate_backups(&backup_dir, 30).ok();
    Ok(dest)
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
    fn rotate_backups_removes_old_files() {
        let dir = std::env::temp_dir().join(format!(
            "smartlearn-rotate-test-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&dir).expect("create dir");

        // Create two "old" backup files (ts = 0, far in the past) and one recent.
        let old1 = dir.join("smartlearn-backup-0.db");
        let old2 = dir.join("smartlearn-backup-1.db");
        let recent_ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let recent = dir.join(format!("smartlearn-backup-{recent_ts}.db"));
        let other = dir.join("other-file.db");
        for p in &[&old1, &old2, &recent, &other] {
            fs::write(p, b"x").expect("write file");
        }

        let removed = rotate_backups(&dir, 30).expect("rotate");
        assert_eq!(removed, 2, "two old files must be removed");
        assert!(!old1.exists(), "old1 must be gone");
        assert!(!old2.exists(), "old2 must be gone");
        assert!(recent.exists(), "recent must stay");
        assert!(other.exists(), "non-backup files must not be touched");

        fs::remove_dir_all(&dir).ok();
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
