// The kinds of material a lesson can come from (P1-DISC1). The database column `learning_units.source_kind` holds exactly these values
// (migration 049) or NULL when the student did not say; the screens list them in this order.
export const SOURCE_KINDS = Object.freeze(['APOSTILA', 'LIVRO', 'VIDEO', 'OUTRO']);
