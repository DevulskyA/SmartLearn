import { validateNamingField, normalizeEntityName, nameKey } from '../../../shared/text-validation.js';

export class SubjectError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function toDto(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isActive: !!row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function list(db, userId) {
  return db.prepare('SELECT * FROM subjects WHERE user_id = ? ORDER BY sort_order, id').all(userId).map(toDto);
}

function findOwned(db, userId, id) {
  return db.prepare('SELECT * FROM subjects WHERE user_id = ? AND id = ?').get(userId, id);
}

function nextSortOrder(db, userId) {
  const { next } = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM subjects WHERE user_id = ?').get(userId);
  return next;
}

export function create(db, userId, { name, color = 'DISC-BLUE' }) {
  const error = validateNamingField(name, 'o nome da disciplina');
  if (error) throw new SubjectError('VALIDATION_FAILED', error);

  const normalized = normalizeEntityName(name);
  const key = nameKey(name);
  const existing = db.prepare('SELECT id, is_active FROM subjects WHERE user_id = ? AND LOWER(name) = ?').get(userId, key);
  if (existing) {
    // An archived homonym is an explicit conflict, never a silent
    // reactivation — the caller must reactivate() the existing row.
    throw new SubjectError('SUBJECT_CONFLICT', existing.is_active
      ? 'Já existe uma disciplina com esse nome.'
      : 'Já existe uma disciplina arquivada com esse nome. Reative-a em vez de criar uma nova.');
  }

  const now = new Date().toISOString();
  const sortOrder = nextSortOrder(db, userId);
  const result = db.prepare(`
    INSERT INTO subjects (user_id, name, color, is_active, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, ?)
  `).run(userId, normalized, color, sortOrder, now, now);

  return toDto(findOwned(db, userId, result.lastInsertRowid));
}

export function rename(db, userId, id, newName) {
  const subject = findOwned(db, userId, id);
  if (!subject) throw new SubjectError('NOT_FOUND', 'Disciplina não encontrada.');

  const error = validateNamingField(newName, 'o nome da disciplina');
  if (error) throw new SubjectError('VALIDATION_FAILED', error);

  const normalized = normalizeEntityName(newName);
  const key = nameKey(newName);
  const conflict = db.prepare('SELECT id FROM subjects WHERE user_id = ? AND LOWER(name) = ? AND id != ?').get(userId, key, id);
  if (conflict) throw new SubjectError('SUBJECT_CONFLICT', 'Já existe uma disciplina com esse nome.');

  const now = new Date().toISOString();
  db.prepare('UPDATE subjects SET name = ?, updated_at = ? WHERE user_id = ? AND id = ?').run(normalized, now, userId, id);
  return toDto(findOwned(db, userId, id));
}

export function setColor(db, userId, id, color) {
  const subject = findOwned(db, userId, id);
  if (!subject) throw new SubjectError('NOT_FOUND', 'Disciplina não encontrada.');
  const now = new Date().toISOString();
  db.prepare('UPDATE subjects SET color = ?, updated_at = ? WHERE user_id = ? AND id = ?').run(color, now, userId, id);
  return toDto(findOwned(db, userId, id));
}

export function archive(db, userId, id) {
  const subject = findOwned(db, userId, id);
  if (!subject) throw new SubjectError('NOT_FOUND', 'Disciplina não encontrada.');
  const now = new Date().toISOString();
  db.prepare('UPDATE subjects SET is_active = 0, updated_at = ? WHERE user_id = ? AND id = ?').run(now, userId, id);
  return toDto(findOwned(db, userId, id));
}

export function reactivate(db, userId, id) {
  const subject = findOwned(db, userId, id);
  if (!subject) throw new SubjectError('NOT_FOUND', 'Disciplina não encontrada.');
  // Reactivating must not silently create a duplicate of an already-active
  // subject with the same name (e.g. user archived "X", created a new "X",
  // then tries to reactivate the old one).
  const key = nameKey(subject.name);
  const conflict = db.prepare('SELECT id FROM subjects WHERE user_id = ? AND LOWER(name) = ? AND id != ? AND is_active = 1').get(userId, key, id);
  if (conflict) throw new SubjectError('SUBJECT_CONFLICT', 'Já existe uma disciplina ativa com esse nome.');

  const now = new Date().toISOString();
  db.prepare('UPDATE subjects SET is_active = 1, updated_at = ? WHERE user_id = ? AND id = ?').run(now, userId, id);
  return toDto(findOwned(db, userId, id));
}

export function reorder(db, userId, orderedIds) {
  const owned = new Set(db.prepare('SELECT id FROM subjects WHERE user_id = ?').all(userId).map(r => r.id));
  for (const id of orderedIds) {
    if (!owned.has(id)) throw new SubjectError('NOT_FOUND', 'Disciplina não encontrada.');
  }
  const now = new Date().toISOString();
  const update = db.prepare('UPDATE subjects SET sort_order = ?, updated_at = ? WHERE user_id = ? AND id = ?');
  db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, now, userId, id));
  })();
  return list(db, userId);
}

export function deleteEmpty(db, userId, id) {
  const subject = findOwned(db, userId, id);
  if (!subject) throw new SubjectError('NOT_FOUND', 'Disciplina não encontrada.');
  const { n } = db.prepare('SELECT COUNT(*) as n FROM learning_units WHERE user_id = ? AND subject_id = ?').get(userId, id);
  if (n > 0) {
    throw new SubjectError('SUBJECT_NOT_EMPTY', 'Não é possível excluir uma disciplina com aulas cadastradas. Arquive-a em vez disso.');
  }
  db.prepare('DELETE FROM subjects WHERE user_id = ? AND id = ?').run(userId, id);
}
