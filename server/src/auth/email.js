// Normalized lookup form vs preserved display form (design.md §3).
export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function hasEmailShape(value) {
  const at = value.indexOf('@');
  if (at <= 0 || value.indexOf('@', at + 1) !== -1 || /\s/.test(value)) return false;

  const domain = value.slice(at + 1);
  const interiorDot = domain.indexOf('.', 1);
  return interiorDot !== -1 && interiorDot < domain.length - 1;
}

export function validateEmailShape(email) {
  if (typeof email !== 'string') return 'O e-mail deve ser uma string.';
  const trimmed = email.trim();
  if (!trimmed) return 'Informe o e-mail.';
  if (!hasEmailShape(trimmed)) return 'Informe um e-mail válido.';
  return null;
}
