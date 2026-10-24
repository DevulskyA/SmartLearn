// T-F6-01: named e2e suites, reproducible by file. `materials` = everything a student touches from the document to the accepted
// lesson: Materiais, Fonte, rascunho, editor da aula. (The opt-in real-model/real-PDF specs are excluded: they skip by default.)
export const SUITES = {
  materials: [
    'content-quality-flow', 'draft-acceptance', 'generation-jobs', 'keyboard-study-materials', 'large-draft-review', 'large-pdf',
    'lesson-editor', 'materials-a11y', 'source-proposals', 'source-reupload', 'draft-autosave',
  ],
  // the shortest honest check, one shared page and one draft (about a minute): run it after every small change
  smoke: ['smoke'],
  // the Resumo Mestre: renderer, formulas, figures, PDF crop, visual editor, and the lesson editor that hosts them
  summary: [
    'summary-visual-editor', 'summary-math-editor', 'summary-math-plano', 'summary-images', 'summary-pdf-crop',
    'lesson-editor', 'lesson-editor-responsive', 'lesson-editor-a11y', 'draft-acceptance', 'draft-autosave',
  ],
};

// Workers per suite when E2E_WORKERS is not set (default 2). Measured on 12 logical cores: summary 196 s with 2 workers, 153 s with 4. smoke is one serial file.
export const SUITE_WORKERS = { summary: 4, smoke: 1 };
