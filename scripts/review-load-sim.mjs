#!/usr/bin/env node
// HG-09 decision aid (F3): how much review WORK each scheduling policy puts in front of the student after absences.
// Synthetic and deterministic: no database, no model, no product code. It measures LOAD and history shape only. It says
// nothing about retention: every performed review is assumed successful, so a lower number here is never "better learning".
//   node scripts/review-load-sim.mjs
import { fileURLToPath } from 'node:url';
import { REVIEW_DAY_OFFSETS } from '../shared/review-schedule.js';

const OFFSETS = REVIEW_DAY_OFFSETS;

/**
 * @param {object} cfg
 * @param {number[]} cfg.studyDays   day each unit is first studied
 * @param {(day:number)=>boolean} cfg.active  does the student study on this day
 * @param {number} cfg.capacity      reviews the student does on an active day
 * @param {number} cfg.horizon       last simulated day
 * @param {'FIXED16'|'ONE_ACTIVE'} cfg.policy
 *   FIXED16    today: all 16 dates exist from the start, anchored to the study date; a missed one stays overdue.
 *   ONE_ACTIVE HG-09 option 3: one live obligation per unit; the next date is anchored to the review REALLY done, spaced by the
 *              gap the fixed schedule has between the two stages.
 */
export function simulate({ studyDays, active, capacity, horizon, policy }) {
  const units = studyDays.map((s, id) => ({ id, s, stage: 0, due: s + OFFSETS[0] }));
  const fixed = units.flatMap((u) => OFFSETS.map((o, stage) => ({ unit: u.id, stage, due: u.s + o, doneOn: null })));
  const out = { peakBacklog: 0, backlogOnReturn: 0, performed: 0, maxDayLoad: 0, overdueOver7AtEnd: 0, falselyDone: 0 };
  let sawGap = false;
  for (let day = 0; day <= horizon; day += 1) {
    const dueNow = policy === 'FIXED16'
      ? fixed.filter((t) => t.doneOn === null && t.due <= day).sort((a, b) => a.due - b.due)
      : units.filter((u) => u.stage < OFFSETS.length && u.due <= day).sort((a, b) => a.due - b.due);
    out.peakBacklog = Math.max(out.peakBacklog, dueNow.length);
    if (!active(day)) { sawGap = true; continue; }
    if (sawGap) { out.backlogOnReturn = Math.max(out.backlogOnReturn, dueNow.length); sawGap = false; }
    const todays = dueNow.slice(0, capacity);
    out.maxDayLoad = Math.max(out.maxDayLoad, dueNow.length);
    for (const item of todays) {
      out.performed += 1;
      if (policy === 'FIXED16') item.doneOn = day;
      else {
        const gap = OFFSETS[item.stage + 1] === undefined ? 0 : OFFSETS[item.stage + 1] - OFFSETS[item.stage];
        item.stage += 1;
        item.due = day + gap;
      }
    }
  }
  const end = policy === 'FIXED16'
    ? fixed.filter((t) => t.doneOn === null && t.due < horizon - 7).length
    : units.filter((u) => u.stage < OFFSETS.length && u.due < horizon - 7).length;
  out.overdueOver7AtEnd = end;
  return out;
}

const SCENARIOS = {
  'every day': () => true,
  'absent days 20-33 (14 d)': (d) => d < 20 || d > 33,
  'absent days 20-49 (30 d)': (d) => d < 20 || d > 49,
  'absent days 20-79 (60 d)': (d) => d < 20 || d > 79,
  'one day a week': (d) => d % 7 === 0,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const studyDays = Array.from({ length: 10 }, (_, i) => i); // 10 units studied on days 0..9
  console.log('10 synthetic units studied on days 0-9; capacity 15 reviews per active day; horizon 200 days; every performed review succeeds.');
  console.log('policy      scenario                     peakBacklog  backlogOnReturn  performed  overdue>7dAtEnd');
  for (const [name, active] of Object.entries(SCENARIOS)) {
    for (const policy of ['FIXED16', 'ONE_ACTIVE']) {
      const r = simulate({ studyDays, active, capacity: 15, horizon: 200, policy });
      console.log(`${policy.padEnd(11)} ${name.padEnd(28)} ${String(r.peakBacklog).padStart(10)}  ${String(r.backlogOnReturn).padStart(15)}  ${String(r.performed).padStart(9)}  ${String(r.overdueOver7AtEnd).padStart(15)}`);
    }
  }
}
