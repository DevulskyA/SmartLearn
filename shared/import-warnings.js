// Warnings of the migration / import preview (the list under "Revise os itens acima"), as a stable CODE + PARAMETERS.
//
// A warning is { code, params, message, ...extra }. The client shows `t('migration.warning.<CODE>', params)` from the pt-BR catalog
// (src/migration-ui.js: warningText); `message` (the same sentence in Portuguese, the RESERVE) stays so that an older client, a text-only
// consumer, a test or a preview stored before `params` existed keeps working. Deleting the reserve text is a LATER slice.
// Params are strings or numbers only (they travel as JSON). Same contract as server/src/api-error-messages.js, for warnings.
// test/import-warnings.test.js keeps this table and the catalog in agreement.

const TEXT = {
  DEFAULTED_COLOR: ({ id }) => 'Disciplina ' + id + ' sem cor na origem — usando cor padrão.',
  DEFAULTED_SORT_ORDER: ({ id }) => 'Disciplina ' + id + ' sem ordem na origem — usando ordem 0.',
  DEFAULTED_TIMESTAMP: ({ id }) => 'Unidade ' + id + ' sem createdAt/updatedAt na origem — usando a data de estudo.',
  UNKNOWN_FIELDS_IGNORED: ({ set, fields }) => `Campos desconhecidos em ${set} foram ignorados: ${fields}.`,
  MATERIALS_NOT_RESTORED: () => 'Materiais não são restaurados: PDFs, fontes, páginas, propostas, rascunhos, imagens dos resumos e as citações de origem ficam de fora deste backup. Seus estudos, revisões, exercícios, tentativas e provas serão restaurados.',
  MEDIA_NOT_INCLUDED: () => 'Este arquivo foi exportado sem as imagens dos resumos: no lugar de cada figura há uma frase descritiva. Para recuperar as imagens use o backup operacional.',
};

export const IMPORT_WARNING_CODES = Object.freeze(Object.keys(TEXT));

/** The reserve sentence of a warning (also what the catalog must say, with {name} for each param). */
export function importWarningReserveText(code, params = {}) {
  if (!Object.hasOwn(TEXT, code)) throw new Error(`unknown import warning code ${code}`);
  return TEXT[code](params);
}

/**
 * Builds one warning. `extra` keeps fields that older consumers already read (e.g. `set` of UNKNOWN_FIELDS_IGNORED).
 * @param {string} code  one of IMPORT_WARNING_CODES
 * @param {Record<string,string|number>} [params]
 * @param {object} [extra]
 */
export function importWarning(code, params = {}, extra = {}) {
  return { code, ...extra, params, message: importWarningReserveText(code, params) };
}
