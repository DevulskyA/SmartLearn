// Mensajes del almacenamiento conectado al servidor.
export default Object.freeze({
  'store.error.offline': 'Sin conexión: esta acción requiere internet.',
  'store.error.network': 'Error de red al acceder a {path}: {reason}',
  'store.error.unsupportedUnitField': 'El modo servidor todavía no permite corregir la fecha de estudio ni cambiar la asignatura.',
  'store.error.unsupportedPartialUpdate': 'Esta combinación de campos no tiene un equivalente atómico en el modo servidor.',
  'store.error.unsupportedDirectReviewEvidence': 'La evidencia de tipo REVIEW solo se puede crear al completar un repaso.',
  'store.error.unsupportedSettingsField': 'Ingresa un campo reconocido: timezone, uiLocale o generationLocale.',
  'store.error.importNotSupported': 'El modo servidor todavía no permite restaurar una copia: usa la exportación heredada hasta que se complete la migración.',
  'store.error.resetNotSupported': 'El modo servidor todavía no permite restablecer todos los datos.',
});
