// Shell, shared actions, boot errors, and generic messages.
export default Object.freeze({
  // Boot
  'shell.dbError.server': 'Error: could not connect to the server. Try again in a moment.',
  'shell.loadFailed': 'Could not load this screen. Check your connection; anything you saved is unaffected.',
  'shell.retry': 'Try again',
  'shell.dbError.local': 'Error: local data could not be read. Your data is preserved, but the app is temporarily unavailable.',

  // Buttons and labels shared by several screens
  'shell.action.save': 'Save',
  'shell.action.register': 'Record',
  'shell.action.viewContent': 'View content',
  'shell.action.viewAnswer': 'View answer',
  'shell.summaryMaster': 'Master Summary',
  'shell.toReinforce': '{count} to reinforce',
  'shell.exercises.title': 'Exercises ({count})',
  'shell.action.edit': 'Edit',
  'shell.action.delete': 'Delete',
  'shell.field.subjectName': 'the subject name',
  'shell.field.studyContent': 'the study content',
  'shell.saving': 'Saving…',
  'shell.exam.subject': 'Subject exam',
  'shell.action.cancel': 'Cancel',
  'shell.exercise.why': 'Why: {text}',
  'shell.exercise.hint': 'Hint: {text}',
  'shell.exercise.priorWrong': 'Incorrect on the last attempt',
  'shell.action.hideAnswer': 'Hide answer',
  'shell.action.collapse': 'Collapse',
  'shell.action.viewInPlan': 'View in Plan',
  'shell.retest.remaining': 'Retry the questions you still got wrong ({count})',
  'shell.retest.all': 'Retry the incorrect questions ({count})',
});
