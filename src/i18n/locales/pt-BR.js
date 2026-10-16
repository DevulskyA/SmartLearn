// pt-BR catalog, assembled from one file per area under ./pt-BR/. A key lives in exactly one area (test/i18n.test.js fails on a
// duplicate), so adding text to an area never touches another one. Keys are 'area.what.detail'.
import auth from './pt-BR/auth.js';
import review from './pt-BR/review.js';
import priority from './pt-BR/priority.js';
import theme from './pt-BR/theme.js';
import validation from './pt-BR/validation.js';
import sharedUi from './pt-BR/sharedUi.js';
import status from './pt-BR/status.js';
import store from './pt-BR/store.js';
import lesson from './pt-BR/lesson.js';
import proposals from './pt-BR/proposals.js';

export const AREAS = { auth, review, priority, theme, validation, sharedUi, status, store, lesson, proposals };

export default Object.assign({}, ...Object.values(AREAS));
