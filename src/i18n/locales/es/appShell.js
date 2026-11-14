// Estructura común, acciones, errores de inicio y mensajes generales.
export default Object.freeze({
  // Inicio
  'shell.dbError.server': 'Error: no se pudo conectar con el servidor. Inténtalo de nuevo en unos momentos.',
  'shell.loadFailed': 'No se pudo cargar esta pantalla. Revisa tu conexión; lo que guardaste no se vio afectado.',
  'shell.retry': 'Intentar de nuevo',
  'shell.dbError.local': 'Error: no se pudieron leer los datos locales. Tus datos se conservan, pero la aplicación no está disponible temporalmente.',

  // Botones y etiquetas compartidos entre varias pantallas
  'shell.action.save': 'Guardar',
  'shell.action.register': 'Registrar',
  'shell.action.viewContent': 'Ver contenido',
  'shell.action.viewAnswer': 'Ver respuesta',
  'shell.summaryMaster': 'Resumen maestro',
  'shell.toReinforce': '{count} para reforzar',
  'shell.exercises.title': 'Ejercicios ({count})',
  'shell.action.edit': 'Editar',
  'shell.action.delete': 'Eliminar',
  'shell.field.subjectName': 'el nombre de la asignatura',
  'shell.field.studyContent': 'el contenido estudiado',
  'shell.saving': 'Guardando…',
  'shell.exam.subject': 'Examen de la asignatura',
  'shell.action.cancel': 'Cancelar',
  'shell.exercise.why': 'Por qué: {text}',
  'shell.exercise.hint': 'Pista: {text}',
  'shell.exercise.priorWrong': 'Respuesta incorrecta en el último intento',
  'shell.action.hideAnswer': 'Ocultar respuesta',
  'shell.action.collapse': 'Contraer',
  'shell.action.viewInPlan': 'Ver en Plan',
  'shell.retest.remaining': 'Reintentar las preguntas que todavía tienes incorrectas ({count})',
  'shell.retest.all': 'Reintentar las preguntas incorrectas ({count})',
});
