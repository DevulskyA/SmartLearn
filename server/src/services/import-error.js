// Shared by services/imports.js (legacy import) and services/logical-restore.js
// (IMPORT-1) so neither has to import the other just to throw the same error.
export class ImportError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
