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
import editor from './pt-BR/editor.js';
import materials from './pt-BR/materials.js';
import localStore from './pt-BR/localStore.js';
import appShell from './pt-BR/appShell.js';
import appToday from './pt-BR/appToday.js';
import appPlan from './pt-BR/appPlan.js';
import appStudies from './pt-BR/appStudies.js';
import appStats from './pt-BR/appStats.js';
import appSettings from './pt-BR/appSettings.js';
import appAccount from './pt-BR/appAccount.js';
import screens from './pt-BR/screens.js';
import appBackup from './pt-BR/appBackup.js';
import appStudyNow from './pt-BR/appStudyNow.js';
import appExam from './pt-BR/appExam.js';
import appRegister from './pt-BR/appRegister.js';
import appReview from './pt-BR/appReview.js';
import experiment from './pt-BR/experiment.js';

export const AREAS = { auth, review, priority, theme, validation, sharedUi, status, store, lesson, proposals, editor, materials, localStore, appShell, appToday, appPlan, appStudies, appStats, appSettings, appAccount, screens, appBackup, appStudyNow, appExam, appRegister, appReview, experiment };

export default Object.assign({}, ...Object.values(AREAS));
