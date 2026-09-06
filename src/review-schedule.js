// T15: compatibility re-export. The pure schedule logic now lives in
// shared/review-schedule.js (single source shared with the server) —
// this file exists so existing client imports keep working unchanged.
export { REVIEW_DAY_OFFSETS, generateReviewDates } from '../shared/review-schedule.js';
