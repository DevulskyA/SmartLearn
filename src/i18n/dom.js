// Static text of index.html. The Portuguese written in the HTML is only what shows before this script runs (and without
// JavaScript); the catalog is the single source, and test/i18n-html.test.js fails when the two differ.
//
//   <h1 data-i18n="screens.subjects.title">Disciplinas</h1>                     -> textContent
//   <button data-i18n-aria-label="screens.x.label" aria-label="...">           -> the attribute named after "data-i18n-"
import { t } from './index.js';

const ATTRIBUTES = ['title', 'aria-label', 'placeholder', 'alt'];

/** Fills every marked element under `root` from the active catalog. Safe to call again after a locale change. */
export function applyStaticTexts(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const name of ATTRIBUTES) {
    for (const el of root.querySelectorAll(`[data-i18n-${name}]`)) el.setAttribute(name, t(el.getAttribute(`data-i18n-${name}`)));
  }
}
