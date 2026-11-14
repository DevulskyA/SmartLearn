// Settings card "Compartilhar conteúdo revisado": the account switch (OFF until the student turns it on) and, per material, the basis on which
// the student may let content generated from it be reused (their own work, licensed for it, public domain). The server decides what is ever
// shared (services/shared-reuse.js); this module only shows and changes the two declarations through /v1/settings/reuse.
import { apiRequest, ApiError, NetworkError } from './api-client.js';
import { t } from './i18n/index.js';
import { createTextElement } from './dom-utils.js';

const BASES = ['OWN_WORK', 'LICENSED', 'PUBLIC_DOMAIN'];

function failureText(err) {
  if (err instanceof ApiError || err instanceof NetworkError) return t('appSettings.reuse.failed');
  throw err;
}

function basisSelect(source, onChange) {
  const label = document.createElement('label');
  label.className = 'reuse-source-row';
  label.append(createTextElement('span', 'reuse-source-name', source.name));
  const select = document.createElement('select');
  select.setAttribute('aria-label', t('appSettings.reuse.sourceLabel', { name: source.name }));
  for (const value of ['', ...BASES]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(value === '' ? 'appSettings.reuse.basis.none' : `appSettings.reuse.basis.${value}`);
    select.append(option);
  }
  select.value = source.basis ?? '';
  select.addEventListener('change', () => onChange(select));
  label.append(select);
  return label;
}

/** Loads the state and wires the card. `card` holds #reuse-switch, #reuse-sources and #reuse-message. Safe to call again (it re-renders). */
export async function renderReuseSettings(card) {
  const toggle = card.querySelector('#reuse-switch');
  const list = card.querySelector('#reuse-sources');
  const message = card.querySelector('#reuse-message');
  const say = (text, isError = false) => { message.classList.toggle('is-error', isError); message.textContent = text; };

  let overview;
  try {
    overview = (await apiRequest('/v1/settings/reuse')).reuse;
  } catch (err) { say(failureText(err), true); return; }

  toggle.checked = overview.granted === true;
  const draw = (sources) => {
    list.replaceChildren();
    if (sources.length === 0) { list.append(createTextElement('p', 'lesson-hint', t('appSettings.reuse.noSources'))); return; }
    for (const source of sources) {
      list.append(basisSelect(source, async (select) => {
        select.disabled = true;
        try {
          await apiRequest(`/v1/settings/reuse/sources/${source.id}`, { method: 'PUT', body: { basis: select.value === '' ? null : select.value } });
          source.basis = select.value === '' ? null : select.value;
          say(select.value === '' ? t('appSettings.reuse.withdrawn') : t('appSettings.reuse.saved'));
        } catch (err) {
          select.value = source.basis ?? '';
          say(failureText(err), true);
        } finally { select.disabled = false; }
      }));
    }
  };
  draw(overview.sources);

  toggle.onchange = async () => {
    const wanted = toggle.checked;
    toggle.disabled = true;
    try {
      await apiRequest('/v1/settings/reuse', { method: 'PUT', body: { granted: wanted } });
      say(wanted ? t('appSettings.reuse.saved') : t('appSettings.reuse.withdrawn'));
    } catch (err) {
      toggle.checked = !wanted;
      say(failureText(err), true);
    } finally { toggle.disabled = false; }
  };
}
