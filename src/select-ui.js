// Shared select/combobox primitives. THREE distinct ARIA patterns live
// here on purpose — see DESIGN.md "Select / combobox / context-switcher —
// three distinct patterns, not one" for the full rationale. A prior
// version of this file generalized the subject context-switcher's own
// grammar ("current value never appears in its own open menu") into the
// shared primitive and applied it to every ordinary select in the app.
// That was a real defect: an ordinary select's open popup is required
// (current, non-deprecated WAI-ARIA APG semantics) to list every real
// option including whichever one is currently selected. The three
// widgets below share only genuinely semantic-neutral pieces (visual
// tokens, popup positioning/collision math, the typeahead string-match
// helper) — their actual interaction models are different on purpose:
//
// A. mount()/enhanceSelect() — every real <select> in the app. WAI-ARIA
//    APG "Select-Only Combobox": the visible control is `role="combobox"`;
//    DOM focus stays ON it the entire time the popup is open (never moves
//    into the popup) — navigation only previews a value via
//    aria-activedescendant; only Enter/Space/click COMMITS; Escape/Tab/
//    outside-click cancel without committing. The popup lists every real
//    option, including the current one, correctly `aria-selected`.
//
// B. Searchable combobox — not implemented; no current consumer's option
//    count justifies it. Do not add speculatively.
//
// C. wireListboxKeyboard() — used by the subject context-switcher
//    (src/app.js), a WAI-ARIA APG "Menu Button" (its real semantic is
//    "perform an action to switch context," not "pick a value from a set
//    that includes the current one"). Real DOM focus DOES move into the
//    popup on open (roving via aria-activedescendant), matching how a
//    menu's own keyboard model actually works — the opposite of pattern
//    A's focus-stays-on-trigger model. Never reuse this for an ordinary
//    select just to save code.
//
// The native <select> backing every pattern-A instance is never deleted
// (compatibility: `.value`/`.options`/`disabled`/`change` event, exactly
// as every existing consumer already reads it) but is `aria-hidden` and
// out of the tab order — assistive tech is exposed to exactly ONE control
// per selection (the custom combobox), never both at once.

const registry = new WeakMap();
let uidCounter = 0;

// Pure, DOM-shape-agnostic: given a list of item elements (each exposing
// .textContent and whatever isDisabled(item) checks), find the first one
// at or after startIndex (wrapping) whose text starts with buffer. Shared
// by both keyboard controllers below — genuinely semantic-neutral, since
// "does this option's label start with what was typed" means the same
// thing regardless of whether the calling widget is a combobox or a menu.
function findTypeaheadMatch(items, startIndex, buffer, isDisabled) {
  if (!items.length || !buffer) return -1;
  for (let step = 0; step < items.length; step++) {
    const idx = (startIndex + step) % items.length;
    if (isDisabled(items[idx])) continue;
    if (items[idx].textContent.toLowerCase().startsWith(buffer)) return idx;
  }
  return -1;
}

function isItemDisabled(item) {
  return item.classList.contains("is-disabled");
}

// ---------------------------------------------------------------------
// Pattern C mechanics: WAI-ARIA "Menu" roving focus — real DOM focus
// lives on the popup itself while it's open; aria-activedescendant marks
// the active menuitem within it. Used only by the context-switcher.
// ---------------------------------------------------------------------
export function wireListboxKeyboard(menu, { getItems, onCommit, onEscape, onTabAway }) {
  let typeaheadBuffer = "";
  let typeaheadTimer = null;

  function focusedIndex(items) {
    const current = items.findIndex((it) => it.classList.contains("is-focused"));
    return current >= 0 ? current : 0;
  }

  function setActive(items, index) {
    const item = items[index];
    if (!item) return;
    menu.setAttribute("aria-activedescendant", item.id);
    for (const it of items) it.classList.toggle("is-focused", it === item);
    item.scrollIntoView({ block: "nearest" });
  }

  function moveFocus(delta) {
    const items = getItems();
    if (!items.length) return;
    let next = focusedIndex(items);
    for (let step = 0; step < items.length; step++) {
      next = (next + delta + items.length) % items.length;
      if (!isItemDisabled(items[next])) break;
    }
    setActive(items, next);
  }

  function jumpFocus(toEnd) {
    const items = getItems();
    if (!items.length) return;
    if (!toEnd) {
      const first = items.findIndex((it) => !isItemDisabled(it));
      if (first >= 0) setActive(items, first);
    } else {
      for (let i = items.length - 1; i >= 0; i--) {
        if (!isItemDisabled(items[i])) {
          setActive(items, i);
          break;
        }
      }
    }
  }

  function typeahead(char) {
    const items = getItems();
    if (!items.length) return;
    clearTimeout(typeaheadTimer);
    typeaheadBuffer += char.toLowerCase();
    typeaheadTimer = setTimeout(() => (typeaheadBuffer = ""), 500);
    const match = findTypeaheadMatch(items, (focusedIndex(items) + 1) % items.length, typeaheadBuffer, isItemDisabled);
    if (match >= 0) setActive(items, match);
  }

  menu.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        onEscape();
        return;
      case "ArrowDown":
        event.preventDefault();
        moveFocus(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(-1);
        return;
      case "Home":
        event.preventDefault();
        jumpFocus(false);
        return;
      case "End":
        event.preventDefault();
        jumpFocus(true);
        return;
      case "Enter":
      case " ": {
        event.preventDefault();
        const items = getItems();
        const item = items[focusedIndex(items)];
        if (item) onCommit(item);
        return;
      }
      case "Tab":
        onTabAway?.();
        return;
      default:
        if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
          typeahead(event.key);
        }
    }
  });

  return {
    setActiveFirst() {
      const items = getItems();
      if (items.length) setActive(items, 0);
    },
  };
}

// ---------------------------------------------------------------------
// Pattern A mechanics: WAI-ARIA "Select-Only Combobox" — real DOM focus
// NEVER leaves the combobox/trigger element while the popup is open;
// aria-activedescendant on the OWNER marks the previewed option.
// Arrow/Home/End/typeahead only preview; Enter/Space commit; Escape/
// Tab/outside-click cancel the preview without committing. Arrow keys do
// NOT wrap (matching a native <select>'s own open-dropdown behavior),
// unlike the Menu pattern above.
// ---------------------------------------------------------------------
function wireComboboxKeyboard(owner, { isOpen, getItems, getActiveIndex, onPreview, onCommit, onCancel, onOpen }) {
  let typeaheadBuffer = "";
  let typeaheadTimer = null;

  function moveActive(delta) {
    const items = getItems();
    if (!items.length) return;
    let next = getActiveIndex();
    // Clamp, don't wrap: stepping past either end simply stays put,
    // mirroring how a native <select>'s own open dropdown behaves.
    while (true) {
      next += delta;
      if (next < 0 || next >= items.length) return;
      if (!isItemDisabled(items[next])) break;
    }
    onPreview(next);
  }

  function jumpTo(toEnd) {
    const items = getItems();
    if (!items.length) return;
    if (!toEnd) {
      const first = items.findIndex((it) => !isItemDisabled(it));
      if (first >= 0) onPreview(first);
    } else {
      for (let i = items.length - 1; i >= 0; i--) {
        if (!isItemDisabled(items[i])) {
          onPreview(i);
          break;
        }
      }
    }
  }

  function typeahead(char) {
    const items = getItems();
    if (!items.length) return;
    clearTimeout(typeaheadTimer);
    typeaheadBuffer += char.toLowerCase();
    typeaheadTimer = setTimeout(() => (typeaheadBuffer = ""), 500);
    const match = findTypeaheadMatch(items, (getActiveIndex() + 1) % items.length, typeaheadBuffer, isItemDisabled);
    if (match >= 0) onPreview(match);
  }

  owner.addEventListener("keydown", (event) => {
    // Closed state: ArrowDown/ArrowUp/Enter/Space open the popup (without
    // previewing/committing anything yet) — every other key is a no-op
    // here. This single handler owns both states so there is exactly one
    // source of truth for "is the popup open" at keydown time, instead of
    // two independent listeners racing on the same keypress.
    if (!isOpen()) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        onOpen();
      }
      return;
    }
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        onCancel();
        return;
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        return;
      case "Home":
        event.preventDefault();
        jumpTo(false);
        return;
      case "End":
        event.preventDefault();
        jumpTo(true);
        return;
      case "Enter":
      case " ": {
        event.preventDefault();
        const items = getItems();
        const item = items[getActiveIndex()];
        if (item) onCommit(item);
        return;
      }
      case "Tab":
        // No preventDefault: let the browser move focus to the next
        // control in the natural sequence exactly as it would for a
        // native <select> — the popup just needs to close first, without
        // committing whatever was only being previewed.
        onCancel();
        return;
      default:
        if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
          typeahead(event.key);
        }
    }
  });
}

function optionsOf(select) {
  return Array.from(select.options);
}

function svgChevron() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "ui-select-chevron");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M6 9l6 6 6-6");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

function labelFor(select) {
  const ariaLabel = select.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;
  if (select.id) {
    const labelEl = document.querySelector(`label[for="${CSS.escape(select.id)}"]`);
    if (labelEl) return labelEl.textContent.trim();
  }
  return "";
}

function mount(select) {
  // A stable unique id per mounted instance — independent of whether the
  // underlying <select> itself has an id (many consumers don't) — so
  // aria-controls always resolves to a real element and two selects
  // without their own ids never collide on the same generated option ids.
  const uid = `ui-select-${++uidCounter}`;

  // WAI-ARIA-in-HTML restricts which roles a native <button> may take,
  // and "combobox" is not one of them — the current APG Select-Only
  // Combobox example itself uses a plain element with an explicit
  // tabindex, not a <button>. Using <div role="combobox"> here keeps this
  // spec-conformant; keyboard activation (Enter/Space/Arrow to open) is
  // wired by hand below exactly like every other interaction this widget
  // needs anyway.
  const trigger = document.createElement("div");
  trigger.className = "ui-select-trigger select-control";
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const accessibleLabel = labelFor(select);
  if (accessibleLabel) trigger.setAttribute("aria-label", accessibleLabel);

  const triggerText = document.createElement("span");
  triggerText.className = "ui-select-trigger-text";
  trigger.append(triggerText, svgChevron());

  const menu = document.createElement("ul");
  menu.id = `${uid}-listbox`;
  menu.setAttribute("role", "listbox");
  menu.className = "ui-select-menu";
  menu.hidden = true;
  if (accessibleLabel) menu.setAttribute("aria-label", accessibleLabel);
  trigger.setAttribute("aria-controls", menu.id);

  const wrap = document.createElement("div");
  wrap.className = "ui-select";
  select.insertAdjacentElement("beforebegin", wrap);
  wrap.append(trigger, select);
  document.body.append(menu);

  // Out of the accessible tree entirely (aria-hidden) and out of the tab
  // order (tabIndex -1) — assistive tech must see exactly ONE control
  // representing this choice (the custom combobox above), never this
  // native element too. It still exists, visually "present" (zero-
  // opacity 1px, pointer-events:none) purely as backing state: every
  // existing consumer's `.value`/`.options`/`disabled` reads and `change`
  // listeners keep working unchanged, and its own `change` event re-syncs
  // the custom UI no matter which path changed the value.
  select.classList.add("ui-select-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  select.addEventListener("change", () => api.sync());

  let items = [];
  // The previewed (not yet committed) option's real index in select.options
  // while the popup is open — separate from select.selectedIndex, which
  // only changes on an actual commit (Enter/Space/click).
  let previewRealIndex = -1;

  function syncTrigger() {
    const opt = select.options[select.selectedIndex];
    triggerText.textContent = opt ? opt.text : "";
    trigger.classList.toggle("is-disabled", select.disabled);
    trigger.setAttribute("aria-disabled", String(select.disabled));
    trigger.tabIndex = select.disabled ? -1 : 0;
  }

  // Select-Only Combobox: the popup lists EVERY real option, including
  // whichever one is currently selected — that option is marked
  // aria-selected="true", nothing is filtered out. (This governs ordinary
  // selects only — the context-switcher's own "alternatives only" grammar
  // is a different, LOCKED widget, see DESIGN.md.)
  function buildItems() {
    menu.replaceChildren();
    const currentIndex = select.selectedIndex;
    items = optionsOf(select).map((opt) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(opt.index === currentIndex));
      li.className = "ui-select-item";
      li.textContent = opt.text;
      li.dataset.index = String(opt.index);
      li.id = `${uid}-opt-${opt.index}`;
      if (opt.disabled) {
        li.setAttribute("aria-disabled", "true");
        li.classList.add("is-disabled");
      }
      menu.append(li);
      return li;
    });
  }

  function itemForRealIndex(realIndex) {
    return items.find((it) => Number(it.dataset.index) === realIndex) ?? null;
  }

  function previewIndex(index) {
    const item = items[index];
    if (!item) return;
    previewRealIndex = Number(item.dataset.index);
    trigger.setAttribute("aria-activedescendant", item.id);
    for (const it of items) it.classList.toggle("is-focused", it === item);
    item.scrollIntoView({ block: "nearest" });
  }

  function positionMenu() {
    const rect = trigger.getBoundingClientRect();
    const menuHeight = Math.min(menu.scrollHeight, 320);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < menuHeight + 8 && rect.top > spaceBelow;
    menu.style.minWidth = `${rect.width}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`;
    if (openAbove) {
      menu.style.top = "";
      menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      menu.style.maxHeight = `${Math.max(120, rect.top - 12)}px`;
    } else {
      menu.style.bottom = "";
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.maxHeight = `${Math.max(120, window.innerHeight - rect.bottom - 12)}px`;
    }
  }

  function isOpen() {
    return !menu.hidden;
  }

  function openMenu() {
    if (select.disabled || isOpen()) return;
    buildItems(); // rebuild against the current value right before showing
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    trigger.classList.add("is-open");
    positionMenu();
    // Per the Select-Only Combobox pattern, opening previews the CURRENTLY
    // SELECTED option (not always the first) — it's in the list now, so
    // there's always a real item to point activedescendant at.
    const currentItem = itemForRealIndex(select.selectedIndex) ?? items[0];
    if (currentItem) previewIndex(items.indexOf(currentItem));
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
  }

  // Closing WITHOUT committing (Escape, Tab, outside-click): the value
  // stays exactly what it was before the popup opened. Focus never left
  // the trigger, so there's nothing to "return" — closeMenu never needs a
  // returnFocus flag the way the Menu pattern does.
  function closeMenu() {
    if (!isOpen()) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.classList.remove("is-open");
    trigger.removeAttribute("aria-activedescendant");
    previewRealIndex = -1;
    window.removeEventListener("resize", positionMenu);
    window.removeEventListener("scroll", positionMenu, true);
  }

  function commitRealIndex(realIndex) {
    const opt = select.options[realIndex];
    if (!opt || opt.disabled) return;
    const changed = select.selectedIndex !== realIndex;
    select.selectedIndex = realIndex;
    syncTrigger();
    closeMenu();
    trigger.focus();
    if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  wireComboboxKeyboard(trigger, {
    isOpen,
    getItems: () => items,
    getActiveIndex: () => {
      const idx = items.findIndex((it) => Number(it.dataset.index) === previewRealIndex);
      return idx >= 0 ? idx : 0;
    },
    onPreview: (index) => previewIndex(index),
    onCommit: (item) => commitRealIndex(Number(item.dataset.index)),
    onCancel: () => closeMenu(),
    onOpen: () => { if (!select.disabled) openMenu(); },
  });

  trigger.addEventListener("click", () => {
    if (select.disabled) return;
    isOpen() ? closeMenu() : openMenu();
  });

  menu.addEventListener("click", (event) => {
    const li = event.target.closest("li[role=option]");
    if (!li) return;
    commitRealIndex(Number(li.dataset.index));
  });

  document.addEventListener("click", (event) => {
    if (!isOpen()) return;
    // Some consumers wrap their <select> in a real <label> (for its
    // visually-hidden caption text). A <button> trigger used to absorb
    // the label's native "forward a click to my associated control"
    // behavior for free (browsers suppress that forwarding when the
    // click's real target already has its own activation behavior); a
    // <div role="combobox"> does not, per HTML's own label-activation
    // rules — so clicking the trigger inside such a label ALSO fires a
    // real, separately-targeted click on the (aria-hidden, pointer-
    // events:none) native <select> itself, which bubbles to this same
    // document listener. That forwarded click must never count as
    // "outside" the widget; the native select is as much a part of this
    // widget as the trigger/menu are.
    if (trigger.contains(event.target) || menu.contains(event.target) || select.contains(event.target)) return;
    closeMenu();
  });

  buildItems();
  syncTrigger();

  const api = {
    sync() {
      buildItems();
      syncTrigger();
      if (isOpen()) positionMenu();
    },
  };
  registry.set(select, api);
  return api;
}

export function enhanceSelect(select) {
  if (!select || select.tagName !== "SELECT") return null;
  return registry.get(select) ?? mount(select);
}

export function syncSelect(select) {
  if (!select) return;
  enhanceSelect(select)?.sync();
}

export function enhanceAllSelects(root = document) {
  for (const select of root.querySelectorAll("select:not([data-ui-select-skip])")) {
    enhanceSelect(select);
  }
}
