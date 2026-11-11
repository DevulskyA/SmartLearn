import { matchesSearch, paginate, validatePageRange, PAGE_SIZE } from './model.mjs';
import { COPY } from './copy.mjs';
const ICONS = {
    search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
    back: '<path d="m10 5-7 7 7 7M3 12h18"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z"/>',
    book: '<path d="M3 5c4-2 7-1 9 1 2-2 5-3 9-1v15c-4-2-7-1-9 1-2-2-5-3-9-1zM12 6v15"/>',
    focus: '<path d="M9 3H3v6M15 3h6v6M21 15v6h-6M9 21H3v-6"/>',
};
function icon(name, doc) {
    const span = doc.createElement('span');
    span.setAttribute('aria-hidden', 'true');
    // Static, developer-owned SVG only. User text is never used as markup.
    span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.book}</svg>`;
    return span.firstElementChild;
}
function node(doc, tag, cls, text) {
    const n = doc.createElement(tag);
    if (cls)
        n.className = cls;
    if (text != null)
        n.textContent = text;
    return n;
}
function button(doc, text, cls = 'secondary-button') {
    const b = node(doc, 'button', cls, text);
    b.type = 'button';
    return b;
}
/**
 * Progressive enhancement: keeps every original element, handler, ID and data binding.
 * Safe to call once. No requests, no local/remote DB access, no paid model operations.
 */
export function mountExperience(doc = document) {
    if (!doc.querySelector('.app-shell') || doc.documentElement.dataset.slMounted === '1')
        return null;
    doc.documentElement.dataset.slMounted = '1';
    doc.documentElement.classList.add('sl-redesign');
    const abort = new AbortController();
    const signal = abort.signal;
    const observers = [];
    const disposers = [];
    const inserted = [];
    const controllers = [];
    const on = (el, event, fn, options = {}) => el?.addEventListener(event, fn, { ...options, signal });
    const observe = (el, fn, config) => { if (!el)
        return; const o = new MutationObserver(fn); o.observe(el, config); observers.push(o); return o; };
    const insert = (n) => { inserted.push(n); return n; };
    const $ = (selector, base = doc) => base.querySelector(selector);
    const $$ = (selector, base = doc) => [...base.querySelectorAll(selector)];
    const main = $('.app-main');
    const header = $('.app-header');
    const nav = $('.app-nav');
    let seq = 0, sourceName = '', libraryMode = true, pendingSource = null;
    const brand = $('.brand');
    const context = insert(node(doc, 'span', 'sl-chrome-context', COPY.appSection));
    brand?.after(context);
    const chromeRight = insert(node(doc, 'div', 'sl-chrome-right'));
    const chromeLabel = node(doc, 'span', 'sl-chrome-label', 'APRENDER \u00b7 REVISAR \u00b7 EVOLUIR');
    chromeRight.append(chromeLabel);
    const theme = $('#theme-toggle');
    if (theme)
        chromeRight.append(theme);
    header?.append(chromeRight);
    if (nav && !$('.sl-nav-note', nav)) {
        const note = insert(node(doc, 'p', 'sl-nav-note', 'O seu estudo, em continuidade.\nTudo o que importa, no lugar certo.'));
        const build = $('#build-identity', nav);
        nav.insertBefore(note, build || null);
    }
    const descriptions = { today: 'Seu pr\u00f3ximo passo, com clareza.', materials: 'Da fonte ao resumo. Do resumo ao conhecimento.', plan: 'Todas as suas aulas, com o contexto de cada estudo.', stats: 'Veja o que evoluiu e onde concentrar o pr\u00f3ximo esfor\u00e7o.', settings: 'Um ambiente de estudo do seu jeito.', account: 'Sua conta e a continuidade dos seus estudos.', register: 'Registre o conte\u00fado estudado. O sistema organiza as revis\u00f5es.' };
    for (const screen of $$('[data-screen-panel]')) {
        const heading = $(':scope > .screen-heading', screen);
        if (heading && descriptions[screen.dataset.screenPanel]) {
            const host = $('h1', heading)?.parentElement;
            if (host && !$('.sl-screen-description', host))
                host.append(insert(node(doc, 'p', 'sl-screen-description', descriptions[screen.dataset.screenPanel])));
        }
    }
    function syncNavigation() {
        const screen = $$('[data-screen-panel]').find(s => !s.hidden);
        if (!screen)
            return;
        const key = screen.dataset.screenPanel;
        const readerTitle = key === 'materials' && !$('#sources-editor-view')?.hidden ? $('.lesson-title', $('#sources-editor-view'))?.textContent : null;
        context.textContent = readerTitle ? `Materiais / ${readerTitle}` : $(':scope > .screen-heading h1', screen)?.textContent || COPY.appSection;
        for (const b of $$('.app-nav [data-screen]')) {
            const active = b.dataset.screen === key;
            b.classList.toggle('is-active', active);
            if (active)
                b.setAttribute('aria-current', 'page');
            else
                b.removeAttribute('aria-current');
        }
        if (key !== 'materials')
            doc.documentElement.classList.remove('sl-focus');
    }
    for (const s of $$('[data-screen-panel]'))
        observe(s, syncNavigation, { attributes: true, attributeFilter: ['hidden'] });
    syncNavigation();
    function makeSearch(label, placeholder) {
        const wrap = node(doc, 'label', 'sl-search');
        wrap.append(icon('search', doc));
        const input = doc.createElement('input');
        input.type = 'search';
        input.placeholder = placeholder;
        input.setAttribute('aria-label', label);
        input.autocomplete = 'off';
        wrap.append(input);
        return { wrap, input };
    }
    /** Search and pagination are views over existing DOM rows; host remains data authority. */
    function enhanceList({ list, selector, label, placeholder, toolsBefore, listParent, pagerAfter, decorate, searchText, source = false }) {
        if (!list)
            return null;
        let query = '', page = 1, matching = [], all = [], scheduled = false;
        const tools = insert(node(doc, 'div', source ? 'sl-list-tools' : 'sl-plan-toolbar'));
        const search = makeSearch(label, placeholder);
        const count = node(doc, 'span', 'sl-list-count');
        count.setAttribute('role', 'status');
        count.setAttribute('aria-live', 'polite');
        tools.append(search.wrap, count);
        const quick = node(doc, 'div', 'sl-top-pager');
        const quickPrev = button(doc, '\u2190', 'small-button'), quickNext = button(doc, '\u2192', 'small-button');
        quickPrev.setAttribute('aria-label', 'P\u00e1gina anterior');
        quickNext.setAttribute('aria-label', 'Pr\u00f3xima p\u00e1gina');
        quick.append(quickPrev, quickNext);
        tools.append(quick);
        (toolsBefore || list).before(tools);
        const pager = insert(node(doc, 'div', 'sl-pagination'));
        pager.setAttribute('aria-label', `P\u00e1ginas de ${label.toLocaleLowerCase('pt-BR')}`);
        const actions = node(doc, 'div', 'sl-pagination-actions');
        const prev = button(doc, COPY.previous, 'small-button'), next = button(doc, COPY.next, 'small-button');
        actions.append(prev, next);
        const pageLabel = node(doc, 'label', 'sl-page-control', COPY.page + ' ');
        const select = doc.createElement('select');
        select.setAttribute('aria-label', `P\u00e1gina de ${label.toLocaleLowerCase('pt-BR')}`);
        const totalLabel = node(doc, 'span');
        pageLabel.append(select, totalLabel);
        pager.append(actions, pageLabel);
        (pagerAfter || list).after(pager);
        const empty = insert(node(doc, 'p', 'sl-list-empty', COPY.emptySearch));
        empty.hidden = true;
        list.after(empty);
        function render() {
            all = [...list.querySelectorAll(`:scope > ${selector}`)];
            all.forEach(row => decorate?.(row));
            if (list.id === 'plan-list') {
                const contentOrder = $('#plan-sort')?.value === 'content';
                if (contentOrder) {
                    // Move the *real* DOM rows, preserving their handlers and
                    // screen-reader / keyboard order. CSS `order` only changes
                    // pixels and caused an accessibility regression in V2.
                    const sorted = [...all].sort((a, b) =>
                        ($('.plan-unit-title', a)?.textContent || '').localeCompare(
                            $('.plan-unit-title', b)?.textContent || '', 'pt-BR',
                            { sensitivity: 'base', numeric: true },
                        ));
                    if (sorted.some((row, i) => row !== all[i])) {
                        list.replaceChildren(...sorted);
                        all = sorted;
                    }
                }
            }
            matching = all.filter(row => matchesSearch(searchText?.(row) || row.textContent, query));
            const result = paginate(matching, page, PAGE_SIZE);
            page = result.page;
            const visible = new Set(result.items);
            for (const row of all)
                row.hidden = !visible.has(row);
            count.textContent = COPY.count(result.first, result.last, result.total);
            empty.hidden = result.total > 0 || all.length === 0;
            pager.hidden = result.total <= PAGE_SIZE;
            prev.disabled = quickPrev.disabled = page <= 1;
            next.disabled = quickNext.disabled = page >= result.pageCount;
            quick.hidden = result.total <= PAGE_SIZE;
            // Do not replace the select while keyboard focus is inside it.
            if (select.options.length !== result.pageCount) {
                select.replaceChildren(...Array.from({ length: result.pageCount }, (_, i) => {
                    const option = doc.createElement('option');
                    option.value = String(i + 1);
                    option.textContent = String(i + 1);
                    return option;
                }));
            }
            select.value = String(page);
            totalLabel.textContent = `de ${result.pageCount}`;
            tools.hidden = all.length === 0;
        }
        function queue() { if (scheduled)
            return; scheduled = true; queueMicrotask(() => { scheduled = false; render(); }); }
        function reveal(row) {
            if (!row)
                return;
            all = [...list.querySelectorAll(`:scope > ${selector}`)];
            let subset = all.filter(r => matchesSearch(searchText?.(r) || r.textContent, query));
            if (!subset.includes(row)) {
                query = '';
                search.input.value = '';
                subset = all;
            }
            const index = subset.indexOf(row);
            if (index < 0)
                return;
            page = Math.floor(index / PAGE_SIZE) + 1;
            render();
        }
        on(search.input, 'input', () => { query = search.input.value; page = 1; render(); });
        on(prev, 'click', () => { page--; render(); search.input.focus({ preventScroll: true }); });
        on(next, 'click', () => { page++; render(); search.input.focus({ preventScroll: true }); });
        on(select, 'change', () => { page = Number(select.value); render(); });
        on(quickPrev, 'click', () => { page--; render(); });
        on(quickNext, 'click', () => { page++; render(); });
        observe(list, (mutations) => {
            const added = mutations.some(m => m.target === list && m.type === 'childList');
            if (added) {
                queue();
                queueMicrotask(() => reveal(list.querySelector('.plan-expand-btn[aria-expanded="true"]')?.closest(selector)));
            }
            for (const m of mutations)
                if (m.type === 'attributes' && m.target.matches?.('.plan-expand-btn[aria-expanded="true"]'))
                    reveal(m.target.closest(selector));
        }, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });
        render();
        const api = { render, reveal, search: search.input, get page() { return page; }, get count() { return matching.length; } };
        controllers.push(api);
        return api;
    }
    function decoratePlan(row) {
        const compact = $('.plan-row-compact', row);
        if (!compact || compact.dataset.slNormalized)
            return;
        compact.dataset.slNormalized = '1';
        compact.classList.add('sl-compact-normalized');
        const title = $(':scope > .plan-unit-title', compact), meta = $(':scope > .plan-unit-meta', compact);
        if (title) {
            const name = node(doc, 'div', 'sl-plan-name');
            title.before(name);
            name.append(title);
            if (meta)
                name.append(meta);
        }
        $(':scope > .subject-chip', compact)?.classList.add('sl-plan-identity');
        $('.plan-row-badges', compact)?.classList.add('sl-plan-state');
        const expand = $('.plan-expand-btn', compact);
        if (expand && !expand.textContent.trim() && !$('svg', expand))
            expand.append(icon('back', doc));
    }
    const planSort = $('#plan-sort');
    if (planSort && ![...planSort.options].some(option => option.value === 'content')) {
        const option = node(doc, 'option', '', 'Conteúdo (A–Z)');
        option.value = 'content';
        planSort.append(option);
    }
    const planList = $('#plan-list');
    if (planList) {
        const heading = insert(node(doc, 'div', 'sl-plan-heading'));
        heading.append(node(doc, 'span', '', 'Suas aulas'), node(doc, 'span', '', 'Abra uma linha para estudar ou editar'));
        planList.before(heading);
        enhanceList({ list: planList, selector: '.plan-row', label: COPY.planSearch, placeholder: COPY.planSearchPlaceholder, toolsBefore: $('#plan-filters') || heading, decorate: decoratePlan,
            searchText: row => [$('.subject-chip', row)?.textContent, $('.plan-unit-title', row)?.textContent, $('.plan-unit-meta', row)?.textContent].join(' ') });
    }
    // Existing native content matrix: add one explicit study-date sorter.
    // The date is already recorded in learning_units. The pinned host patch
    // exposes it on each row; we only reorder those same DOM nodes (never
    // copy a row or replace its click/keyboard detail listeners).
    const unitStatsBody = $('#unit-stats-list');
    const unitStatsHeader = $('#unit-stats-head');
    if (unitStatsBody && unitStatsHeader && !$('#sl-unit-study-date-sort',unitStatsHeader)) {
        const label = button(doc, 'Data do estudo ↕', 'sl-native-unit-sort');
        label.id = 'sl-unit-study-date-sort';
        label.setAttribute('aria-label', 'Ordenar conteúdos por data do estudo');
        const th = $('th:first-child',unitStatsHeader);
        th?.append(label);
        let mode = null, scheduled = false;
        const sortUnits = () => {
            if (!mode) return;
            const rows = [...unitStatsBody.children].filter(row => row.matches('tr'));
            // Empty dates are unknown, never the oldest or newest lesson.
            const sorted = rows.map((row,i)=>({row,i})).sort((a,b)=>{
                const x=a.row.dataset.slStudyDate ?? '',y=b.row.dataset.slStudyDate ?? '';
                if(!x||!y)return (!x&&!y)?a.i-b.i:!x?1:-1;
                return (mode==='asc'?x.localeCompare(y):y.localeCompare(x))||a.i-b.i;
            }).map(item=>item.row);
            if(sorted.some((row,i)=>row!==rows[i])) unitStatsBody.replaceChildren(...sorted);
            for (const nativeHeader of $$('th',unitStatsHeader)) nativeHeader.setAttribute('aria-sort','none');
            th?.setAttribute('aria-sort',mode==='asc'?'ascending':'descending');
            label.textContent = `Data do estudo ${mode==='asc'?'↑':'↓'}`;
            label.setAttribute('aria-label', `Ordenar por data do estudo ${mode==='asc'?'mais antigas primeiro':'mais recentes primeiro'}`);
        };
        const queueSort = () => {if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;sortUnits();});};
        on(label,'click',()=>{mode=mode==='asc'?'desc':'asc';sortUnits();});
        // Another original table heading takes precedence over this addition.
        on(unitStatsHeader,'click',event=>{
            if(!event.target.closest('.th-sort-btn'))return;
            mode=null;label.textContent='Data do estudo ↕';
            label.setAttribute('aria-label','Ordenar conteúdos por data do estudo');
        },{capture:true});
        observe(unitStatsBody,queueSort,{childList:true});
    }
    // Native SmartLearn exercise ledger: preserve the original row-opening
    // handlers, attach the real completedAt timestamp, and progressively add
    // sortable columns. No requests, no changes to the host data source.
    const nativeHistory = $('#exercise-notes-body');
    const nativeHistoryTable = nativeHistory?.closest('table');
    if (nativeHistoryTable && !nativeHistoryTable.id) {
        nativeHistoryTable.id = 'sl-native-history-table';
        const headerRow = $('thead tr', nativeHistoryTable);
        const originalHeaders = $$('th', headerRow);
        if (originalHeaders.length === 5) {
            const fields = ['subjectName', 'contentName', 'questions', 'correct', 'accuracy'];
            const headerButton = (label, key) => {
                const b = button(doc, '', 'th-sort-btn sl-native-sort');
                b.dataset.slSortKey = key;
                b.setAttribute('aria-label', `Ordenar por ${label}`);
                return b;
            };
            for (let i = 0; i < originalHeaders.length; i++) {
                const th = originalHeaders[i];
                const b = headerButton(th.textContent.trim(), fields[i]);
                while (th.firstChild) b.append(th.firstChild);
                b.append(node(doc, 'span', 'sl-sort-glyph', '↕'));
                th.append(b);
                th.dataset.slSortKey = fields[i];
                th.setAttribute('aria-sort', 'none');
            }
            const dateHead = node(doc, 'th', '', '');
            dateHead.scope = 'col';
            dateHead.dataset.slSortKey = 'date';
            dateHead.setAttribute('aria-sort', 'none');
            const dateButton = headerButton('data da resposta', 'date');
            dateButton.append('Data ', node(doc, 'span', 'sl-sort-glyph', '↕'));
            dateHead.append(dateButton);
            headerRow.insertBefore(dateHead, originalHeaders[2]);
            const tools = insert(node(doc, 'div', 'sl-history-tools sl-native-history-tools'));
            const search = makeSearch('Buscar no histórico de exercícios', 'Buscar disciplina ou conteúdo');
            const selectLabel = node(doc, 'label', 'field-group');
            selectLabel.append(node(doc, 'span', '', 'Disciplina'));
            const subjectFilter = doc.createElement('select');
            subjectFilter.setAttribute('aria-label', 'Filtrar o histórico por disciplina');
            selectLabel.append(subjectFilter);
            const resultCount = node(doc, 'span', 'sl-caption sl-history-count', '');
            resultCount.setAttribute('role', 'status');
            tools.append(search.wrap, selectLabel, resultCount);
            nativeHistoryTable.closest('.table-scroll')?.before(tools);
            let sortKey = null, ascending = true, scheduled = false;
            const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
            const dateLabel = iso => /^\d{4}-\d{2}-\d{2}/.test(iso)
                ? `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}` : '—';
            function sortValue(row, key) {
                if (key === 'date') return row.dataset.slCompletedAt || null;
                const cols = { subjectName: 0, contentName: 1, questions: 3, correct: 4, accuracy: 5 };
                const cell = row.cells[cols[key]];
                if (!cell) return null;
                if (key === 'questions' || key === 'correct') return Number(cell.textContent.replace(/\D/g, ''));
                if (key === 'accuracy') {
                    const raw = cell.textContent.replace(/[^0-9,.-]/g, '').replace(',', '.');
                    if (!raw) return null;
                    const val = Number(raw);
                    return Number.isFinite(val) ? val : null;
                }
                return cell.textContent.trim();
            }
            const apply = () => {
                const rows = $$('tr.exercise-row', nativeHistory);
                for (const row of rows) if (!row.dataset.slHistoryEnhanced) {
                    row.dataset.slHistoryEnhanced = '1';
                    const td = node(doc, 'td', 'sl-native-history-date', dateLabel(row.dataset.slCompletedAt || ''));
                    td.dataset.cell = 'date';
                    row.insertBefore(td, row.cells[2] || null);
                }
                const subjects = [...new Set(rows.map(r => r.cells[0]?.textContent.trim()).filter(Boolean))].sort(collator.compare);
                const selected = subjectFilter.value || '';
                if (subjectFilter.options.length !== subjects.length + 1 || subjects.some((name, i) => subjectFilter.options[i+1]?.value !== name)) {
                    subjectFilter.replaceChildren();
                    const all = node(doc, 'option', '', 'Todas as disciplinas'); all.value = '';
                    subjectFilter.append(all);
                    for (const name of subjects) { const option=node(doc,'option','',name);option.value=name;subjectFilter.append(option); }
                    subjectFilter.value = selected;
                }
                const query = search.input.value;
                let visible = 0;
                for (const row of rows) {
                    const subjectName = row.cells[0]?.textContent.trim() || '';
                    const contentName = row.cells[1]?.textContent.trim() || '';
                    const match = (!subjectFilter.value || subjectFilter.value === subjectName)
                        && matchesSearch(`${subjectName} ${contentName} ${row.dataset.slCompletedAt || ''}`, query);
                    row.hidden = !match;
                    if (match) visible++;
                }
                resultCount.textContent = `${visible} de ${rows.length} registros`;
                if (sortKey && rows.length > 1) {
                    const withIndex = rows.map((row,i)=>({row,i}));
                    const numeric = new Set(['questions', 'correct', 'accuracy']);
                    const ordered = withIndex.sort((a,b)=>{
                        const va=sortValue(a.row,sortKey),vb=sortValue(b.row,sortKey);
                        const ma=va==null || va==='', mb=vb==null || vb==='';
                        if (ma || mb) return ma===mb?a.i-b.i:ma?1:-1;
                        const d=numeric.has(sortKey)?va-vb:collator.compare(String(va),String(vb));
                        return (ascending?d:-d)||a.i-b.i;
                    }).map(x=>x.row);
                    if (ordered.some((row,i)=>row!==rows[i])) nativeHistory.replaceChildren(...ordered);
                }
                for (const th of $$('thead th[data-sl-sort-key]', nativeHistoryTable)) {
                    const active=th.dataset.slSortKey===sortKey;
                    th.setAttribute('aria-sort',active?(ascending?'ascending':'descending'):'none');
                    const mark=$('.sl-sort-glyph',th);
                    if(mark)mark.textContent=active?(ascending?'↑':'↓'):'↕';
                }
            };
            const queue = () => { if (scheduled) return; scheduled=true;queueMicrotask(()=>{scheduled=false;apply();}); };
            on(headerRow,'click',e=>{
                const b=e.target.closest('button[data-sl-sort-key]'); if(!b)return;
                const next=b.dataset.slSortKey;
                if(sortKey===next)ascending=!ascending;
                else {sortKey=next;ascending=true;}
                queue();
            });
            on(search.input,'input',queue);
            on(subjectFilter,'change',queue);
            observe(nativeHistory,queue,{childList:true});
            queue();
        }
    }

    // MATERIALS: move original nodes rather than cloning controls with duplicate IDs.
    const sourcesCard = $('#sources-card'), panel = $('#sources-proposals-panel'), editorView = $('#sources-editor-view');
    const library = insert(node(doc, 'div', 'sl-material-library'));
    const documentView = insert(node(doc, 'div', 'sl-material-document'));
    documentView.hidden = true;
    if (sourcesCard && panel) {
        const originalHeading = $(':scope > .section-heading', sourcesCard);
        const originalActions = $(':scope > .settings-actions', sourcesCard);
        const existing = $('#sources-existing');
        const message = $('#sources-message');
        const generation = $('#sources-generation');
        const libraryHeader = node(doc, 'div', 'sl-library-heading');
        if (originalHeading)
            libraryHeader.append(originalHeading);
        if (originalActions)
            libraryHeader.append(originalActions);
        library.append(libraryHeader);
        if (existing)
            library.append(existing);
        const libraryNote = node(doc, 'div', 'sl-library-note');
        libraryNote.append(icon('book', doc));
        const noteBody = node(doc, 'div');
        noteBody.append(node(doc, 'strong', '', 'Prepare uma vez. Continue de onde parou.'), node(doc, 'p', '', 'Resumos j\u00e1 preparados ficam dispon\u00edveis para confer\u00eancia, edi\u00e7\u00e3o e estudo.'));
        libraryNote.append(noteBody);
        library.append(libraryNote);
        const documentHead = node(doc, 'div', 'sl-document-head');
        const goBack = button(doc, COPY.backLibrary, 'text-button sl-document-back');
        goBack.prepend(icon('back', doc));
        const documentName = node(doc, 'span', 'sl-document-name', COPY.selectedSource);
        documentHead.append(goBack, documentName);
        documentView.append(documentHead, panel);
        sourcesCard.prepend(library, documentView);
        if (message)
            sourcesCard.insertBefore(message, library);
        if (generation)
            sourcesCard.append(generation);
        function showDocument(name, focus = false) {
            libraryMode = false;
            sourceName = name || sourceName;
            documentName.textContent = sourceName || COPY.selectedSource;
            library.hidden = true;
            documentView.hidden = false;
            if (focus) {
                $('#sources-range-start')?.focus({ preventScroll: true });
                documentHead.scrollIntoView({ block: 'start' });
            }
        }
        function showLibrary() { libraryMode = true; library.hidden = false; documentView.hidden = true; $('#sources-choose-file')?.focus({ preventScroll: true }); }
        on(goBack, 'click', showLibrary);
        on($('#sources-choose-file'), 'click', event => { if (pendingSource) {
            event.preventDefault();
            event.stopImmediatePropagation();
        } }, { capture: true });
        // Commit document identity only after the host has rendered that response.
        // While a source is opening, a second click cannot race the original host.
        on(existing, 'click', event => {
            const open = event.target.closest('[data-action="open-source"]');
            if (!open)
                return;
            if (pendingSource) {
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }
            const li = open.closest('li');
            pendingSource = { name: $('.source-existing-name', li)?.textContent || '', total: Number(($('.source-existing-pages', li)?.textContent || '').replace(/[^0-9]/g, '')) };
            library.setAttribute('aria-busy', 'true');
        }, { capture: true });
        on($('#sources-file-input'), 'change', () => {
            const file = $('#sources-file-input').files?.[0];
            if (!file)
                return;
            pendingSource = { name: file.name, total: 0 };
            library.setAttribute('aria-busy', 'true');
        }, { capture: true });
        const commitSource = () => {
            if (!pendingSource || panel.hidden)
                return;
            const pending = pendingSource;
            pendingSource = null;
            library.removeAttribute('aria-busy');
            for (const input of [$('#sources-range-start'), $('#sources-range-end')])
                if (input) {
                    if (pending.total > 0)
                        input.max = String(pending.total);
                    else
                        input.removeAttribute('max');
                }
            showDocument(pending.name);
        };
        observe($('#sources-proposals-list'), mutations => {
            if (mutations.some(m => m.type === 'childList' && m.target.id === 'sources-proposals-list'))
                commitSource();
        }, { childList: true });
        observe(panel, commitSource, { attributes: true, attributeFilter: ['hidden'] });
        observe(message, () => {
            if (message.classList.contains('is-error') && pendingSource) {
                pendingSource = null;
                library.removeAttribute('aria-busy');
            }
        }, { attributes: true, childList: true, subtree: true });
        observe(sourcesCard, () => { if (!sourcesCard.hidden && !panel.hidden && !libraryMode)
            showDocument(sourceName); }, { attributes: true, attributeFilter: ['hidden'] });
        // A selected source at mount is respected; no workflow is restarted.
        if (!panel.hidden)
            showDocument(sourceName);
        const topic = $('.sources-topic', panel), title = $('#sources-topic-title'), rangeForm = $('#sources-range-form');
        const draftHeading = $('#sources-drafts-title');
        if (draftHeading)
            draftHeading.textContent = COPY.continueWork;
        const prepare = rangeForm?.querySelector('button[type="submit"]');
        if (prepare)
            prepare.textContent = 'Preparar resumo';
        if (title)
            title.textContent = COPY.scopeTitle;
        if (topic && title && !$('.sl-scope-hint', topic))
            title.after(insert(node(doc, 'p', 'sl-scope-hint', COPY.scopeHint)));
        if (topic) {
            const advanced = insert(doc.createElement('details'));
            advanced.className = 'sl-advanced';
            advanced.append(node(doc, 'summary', '', COPY.advanced));
            const moveIds = ['sources-search-label', 'sources-topic-form', 'sources-topic-hint', 'sources-topic-results'];
            for (const id of moveIds) {
                const n = $('#' + id);
                if (n)
                    advanced.append(n);
            }
            const or = $('.sources-or', topic);
            if (or)
                advanced.append(or);
            topic.append(advanced);
            if (!rangeForm)
                advanced.open = true; // Legacy base: retain the only working selection route.
        }
        if (rangeForm) {
            const rangeStart = $('#sources-range-start'), rangeEnd = $('#sources-range-end');
            const feedback = insert(node(doc, 'p', 'sl-range-feedback', ''));
            feedback.setAttribute('role', 'status');
            feedback.setAttribute('aria-live', 'polite');
            rangeForm.append(feedback);
            const update = () => {
                if (!rangeStart.value && !rangeEnd.value) {
                    feedback.textContent = '';
                    feedback.hidden = true;
                    rangeEnd.setCustomValidity('');
                    return;
                }
                const result = validatePageRange(rangeStart.value, rangeEnd.value, Number(rangeEnd.max) || Infinity);
                feedback.hidden = false;
                feedback.classList.toggle('is-error', !result.ok);
                feedback.textContent = result.ok ? `${result.count} p\u00e1gina${result.count > 1 ? 's' : ''} selecionada${result.count > 1 ? 's' : ''} \u00b7 ${COPY.sourcePages}` : result.message;
                rangeEnd.setCustomValidity(result.ok ? '' : result.message);
            };
            on(rangeStart, 'input', update);
            on(rangeEnd, 'input', update);
            update();
        }
        const index = $('#sources-index'), proposalList = $('#sources-proposals-list');
        function decorateProposal(row) {
            if (row.dataset.slDecorated)
                return;
            const input = $('.source-proposal-title-input', row), save = $('[data-action="save-proposal-title"]', row);
            if (!input || !save)
                return;
            row.dataset.slDecorated = '1';
            const display = node(doc, 'span', 'sl-proposal-title', input.value);
            input.before(display);
            input.hidden = true;
            save.hidden = true;
            const edit = button(doc, '', 'sl-icon-button sl-line-edit');
            edit.append(icon('edit', doc));
            edit.setAttribute('aria-label', `${COPY.editTitle}: ${input.value}`);
            edit.title = COPY.editTitle;
            display.after(edit);
            let initial = input.value;
            const finish = () => { display.textContent = input.value; display.hidden = false; input.hidden = true; save.hidden = true; edit.setAttribute('aria-label', `${COPY.editTitle}: ${input.value}`); };
            on(edit, 'click', () => { if (!input.hidden) {
                input.value = initial;
                finish();
                return;
            } initial = input.value; display.hidden = true; input.hidden = false; save.hidden = false; edit.setAttribute('aria-label', COPY.cancelEdit); input.focus(); });
            on(input, 'keydown', event => { if (event.key === 'Escape') {
                event.preventDefault();
                input.value = initial;
                finish();
                edit.focus();
            } });
            const saved = $('.source-proposal-saved', row);
            if (saved)
                observe(saved, () => { if (saved.textContent.trim())
                    finish(); }, { childList: true, subtree: true });
        }
        if (index && proposalList)
            enhanceList({ list: proposalList, selector: '.source-proposal-item', label: COPY.sourceSearch, placeholder: COPY.sourceSearchPlaceholder, source: true, decorate: decorateProposal,
                searchText: row => [$('.source-proposal-title-input', row)?.value, $('.source-proposal-range', row)?.textContent].join(' ') });
    }
    // Original editor + original acceptance form, presented at the appropriate moment.
    function enhanceEditor() {
        const materialScreen = $('#screen-materials');
        materialScreen?.classList.toggle('sl-editing-material', Boolean(editorView && !editorView.hidden));
        const editor = $('.lesson-editor', editorView || doc);
        if (!editor || editor.dataset.slEditor)
            return;
        $('.lesson-title', editor)?.setAttribute('aria-level', '1');
        $('.lesson-title', editor)?.setAttribute('role', 'heading');
        syncNavigation();
        editor.dataset.slEditor = '1';
        const head = $('.lesson-head', editor), footer = $('.lesson-accept', editor), tablist = $('.lesson-tabs', editor);
        if (!head || !footer)
            return;
        const actions = node(doc, 'div', 'sl-editor-actions');
        const hint = node(doc, 'span', 'sl-caption', COPY.readerHint);
        const focus = button(doc, COPY.readMode, 'text-button sl-reader-mode');
        focus.prepend(icon('focus', doc));
        focus.setAttribute('aria-pressed', 'false');
        const register = button(doc, COPY.registerStudy, 'primary-button');
        actions.append(hint, focus, register);
        head.append(actions);
        const dialog = doc.createElement('dialog');
        dialog.className = 'sl-accept-dialog';
        dialog.id = `sl-accept-${++seq}`;
        dialog.setAttribute('aria-labelledby', `${dialog.id}-title`);
        const bar = node(doc, 'div', 'sl-dialog-bar');
        const dialogTitle = node(doc, 'h2', '', COPY.registerStudy);
        dialogTitle.id = `${dialog.id}-title`;
        const close = button(doc, '', 'sl-icon-button');
        close.append(icon('close', doc));
        close.setAttribute('aria-label', COPY.close);
        bar.append(dialogTitle, close);
        dialog.append(bar, node(doc, 'p', 'sl-caption', COPY.registerNote), footer);
        editor.append(dialog);
        register.setAttribute('aria-haspopup', 'dialog');
        register.setAttribute('aria-controls', dialog.id);
        const dateInput = $('input[type="date"]', footer);
        const dateLabel = dateInput?.id ? $(`label[for="${dateInput.id}"]`, footer) : null;
        if (dateLabel)
            dateLabel.textContent = COPY.studyDate;
        // Native select-ui.js portals its listbox to document.body. Move the SAME
        // listbox into the modal top layer; all original events and ARIA IDs survive.
        function bringOwnedPopupsInside() {
            for (const trigger of $$('[role="combobox"][aria-controls]', footer)) {
                const popup = doc.getElementById(trigger.getAttribute('aria-controls'));
                if (popup?.getAttribute('role') === 'listbox' && !dialog.contains(popup))
                    dialog.append(popup);
            }
        }
        on(register, 'click', () => { bringOwnedPopupsInside(); if (!dialog.open)
            dialog.showModal(); });
        on(dialog, 'keydown', event => {
            if (event.key !== 'Tab' || event.defaultPrevented)
                return;
            const focusable = $$('button,input,select,textarea,a[href],[tabindex]', dialog).filter(el => el.tabIndex >= 0 && !el.disabled && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length);
            const first = focusable[0], last = focusable.at(-1);
            if (!first)
                return;
            if (event.shiftKey && doc.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
            else if (!event.shiftKey && doc.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
        on(close, 'click', () => dialog.close());
        on(dialog, 'close', () => register.focus({ preventScroll: true }));
        on(dialog, 'click', event => { if (event.target === dialog) {
            const r = dialog.getBoundingClientRect();
            if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
                dialog.close();
        } });
        on(focus, 'click', () => { const active = doc.documentElement.classList.toggle('sl-focus'); focus.setAttribute('aria-pressed', String(active)); focus.lastChild.textContent = active ? COPY.returnMode : COPY.readMode; });
        // Host creates the next action only after the real transaction succeeds.
        observe(footer, () => {
            const next = $('[data-action="study-now"]', footer);
            if (next) {
                register.textContent = 'Aula registrada';
                hint.textContent = 'O registro foi criado. Continue para estudar ou consultar o resumo.';
            }
        }, { childList: true, subtree: true });
        on(footer, 'click', event => { if (event.target.closest('[data-action="study-now"], [data-action="open-summary"]')) {
            dialog.close();
            doc.documentElement.classList.remove('sl-focus');
        } });
        const auditTab = $('[data-tab="review"] .lesson-tab-label', editor);
        if (auditTab)
            auditTab.textContent = 'Confer\u00eancia';
    }
    if (editorView)
        observe(editorView, () => {
            if (editorView.hidden) {
                doc.documentElement.classList.remove('sl-focus');
                $('#screen-materials')?.classList.remove('sl-editing-material');
                syncNavigation();
                return;
            }
            enhanceEditor();
        }, { childList: true, attributes: true, attributeFilter: ['hidden'] });
    enhanceEditor();
    on(nav, 'click', () => { const dialog = $('.sl-accept-dialog[open]'); if (dialog)
        dialog.close(); });
    return {
        controllers,
        refresh() { controllers.forEach(c => c.render()); syncNavigation(); enhanceEditor(); },
        // Disposal is for page teardown; restore the original layout by reloading after uninstall.
        destroy() { abort.abort(); observers.forEach(o => o.disconnect()); disposers.forEach(fn => fn()); doc.documentElement.classList.remove('sl-focus'); },
    };
}
if (typeof window !== 'undefined' && !window.__SMARTLEARN_EXPERIENCE_MANUAL__) {
    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', () => mountExperience(), { once: true });
    else
        mountExperience();
}
