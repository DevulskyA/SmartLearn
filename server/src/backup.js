import { join } from 'node:path';

export async function backup(db, backupDir) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(backupDir, `backup-${timestamp}.db`);
  await db.backup(backupPath);
  return backupPath;
}
