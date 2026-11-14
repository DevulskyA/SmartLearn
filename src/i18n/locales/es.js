// es catalog assembled by area. Keep each key in exactly one module.
import auth from './es/auth.js';
import review from './es/review.js';
import priority from './es/priority.js';
import theme from './es/theme.js';
import validation from './es/validation.js';
import sharedUi from './es/sharedUi.js';
import status from './es/status.js';
import store from './es/store.js';
import lesson from './es/lesson.js';
import proposals from './es/proposals.js';
import editor from './es/editor.js';
import materials from './es/materials.js';
import localStore from './es/localStore.js';
import appShell from './es/appShell.js';
import appToday from './es/appToday.js';
import appPlan from './es/appPlan.js';
import appStudies from './es/appStudies.js';
import appStats from './es/appStats.js';
import appAccount from './es/appAccount.js';
import screens from './es/screens.js';
import appBackup from './es/appBackup.js';
import appStudyNow from './es/appStudyNow.js';
import appExam from './es/appExam.js';
import appRegister from './es/appRegister.js';
import appReview from './es/appReview.js';
import experiment from './es/experiment.js';
import questionFlag from './es/questionFlag.js';
import appUiLanguage from './es/appUiLanguage.js';
import appSettings from './es/appSettings.js';
import migration from './es/migration.js';

const AREAS = { auth, review, priority, theme, validation, sharedUi, status, store, lesson, proposals, editor, materials, localStore, appShell, appToday, appPlan, appStudies, appStats, appAccount, screens, appBackup, appStudyNow, appExam, appRegister, appReview, experiment, questionFlag, appUiLanguage, appSettings, migration };

export default Object.assign({}, ...Object.values(AREAS));
