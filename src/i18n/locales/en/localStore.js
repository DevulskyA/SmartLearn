// Messages from the legacy local store that reach the student.
export default Object.freeze({
  'localStore.state.corrupted': 'Storage read failed: data is corrupted. No operation will be performed.',
  // {label} is the field name supplied by the caller.
  'localStore.nulBytes': '{label} contains disallowed null bytes.',
  'localStore.lineTerminators': '{label} contains disallowed line separators.',
  'localStore.label.title': 'The title',
  'localStore.label.source': 'The source',
  'localStore.label.summary': 'The summary',
  'localStore.label.unitTitle': 'Unit {id} title',
  'localStore.label.unitSource': 'Unit {id} source',
  'localStore.subject.activeRequired': 'Select an active subject.',
});
