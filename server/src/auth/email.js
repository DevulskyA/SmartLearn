// Normalized lookup form vs preserved display form (design.md §3).
export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

const EMAIL_SHAPE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateEmailShape(email) {
  if (typeof email !== 'string') return 'O e-mail deve ser uma string.';
  const trimmed = email.trim();
  if (!trimmed) return 'Informe o e-mail.';
  if (!EMAIL_SHAPE_RE.test(trimmed)) return 'Informe um e-mail válido.';
  return null;
}
