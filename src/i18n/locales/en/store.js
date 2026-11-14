// Messages from the server-backed store.
export default Object.freeze({
  'store.error.offline': 'Offline — this action requires an internet connection.',
  'store.error.network': 'Network error while accessing {path}: {reason}',
  'store.error.unsupportedUnitField': 'Correcting a study date and changing a subject are not yet supported in server mode.',
  'store.error.unsupportedPartialUpdate': 'This combination of fields has no atomic equivalent in server mode.',
  'store.error.unsupportedDirectReviewEvidence': 'REVIEW evidence can only be created by completing a review.',
  'store.error.unsupportedSettingsField': 'Enter a recognized field: timezone, uiLocale, or generationLocale.',
  'store.error.importNotSupported': 'Restoring a backup is not yet supported in server mode — use the legacy export until migration is complete.',
  'store.error.resetNotSupported': 'Resetting all data is not yet supported in server mode.',
});
