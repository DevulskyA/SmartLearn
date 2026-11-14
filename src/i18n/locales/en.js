// en catalog assembled by area. Keep each key in exactly one module.
import auth from './en/auth.js';
import review from './en/review.js';
import priority from './en/priority.js';
import theme from './en/theme.js';
import validation from './en/validation.js';
import sharedUi from './en/sharedUi.js';
import status from './en/status.js';
import store from './en/store.js';
import lesson from './en/lesson.js';
import proposals from './en/proposals.js';
import editor from './en/editor.js';
import materials from './en/materials.js';
import localStore from './en/localStore.js';
import appShell from './en/appShell.js';
import appToday from './en/appToday.js';
import appPlan from './en/appPlan.js';
import appStudies from './en/appStudies.js';
import appStats from './en/appStats.js';
import appAccount from './en/appAccount.js';
import screens from './en/screens.js';
import appBackup from './en/appBackup.js';
import appStudyNow from './en/appStudyNow.js';
import appExam from './en/appExam.js';
import appRegister from './en/appRegister.js';
import appReview from './en/appReview.js';
import experiment from './en/experiment.js';
import questionFlag from './en/questionFlag.js';
import appUiLanguage from './en/appUiLanguage.js';
import appSettings from './en/appSettings.js';
import migration from './en/migration.js';

const AREAS = { auth, review, priority, theme, validation, sharedUi, status, store, lesson, proposals, editor, materials, localStore, appShell, appToday, appPlan, appStudies, appStats, appAccount, screens, appBackup, appStudyNow, appExam, appRegister, appReview, experiment, questionFlag, appUiLanguage, appSettings, migration };

export default Object.assign({}, ...Object.values(AREAS));
