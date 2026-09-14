// Shared select/listbox primitive. Progressively enhances a native <select>:
// the native element stays in the DOM (visually hidden, not display:none —
// see mount()) as the single source of truth for value/options/disabled/
// change-events, so every existing consumer that reads `.value` or listens
// for `change` keeps working unchanged, and it remains directly operable by
// screen readers and test automation. All visible interaction goes through
// a themed button trigger + a portalled `role="listbox"` menu, so the
// browser/OS never paints its own popup (the defect this replaces: trigger
// themed correctly, but the open menu fell back to native white/OS chrome).
//
// Selection grammar matches the approved subject context-switcher (see
// DESIGN.md "Single select"): the trigger shows the current value, the open
// menu lists alternatives only — the current value is never duplicated as a
// row inside its own menu.
//
// Mechanics follow the WAI-ARIA APG "Select-Only Combobox" pattern by hand
// (no new dependency): roving focus in the menu, typeahead, Home/End,
// Escape-cancels, focus returns to the trigger on close.

const registry = new WeakMap();

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
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ui-select-trigger select-control";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const accessibleLabel = labelFor(select);
  if (accessibleLabel) trigger.setAttribute("aria-label", accessibleLabel);

  const triggerText = document.createElement("span");
  triggerText.className = "ui-select-trigger-text";
  trigger.append(triggerText, svgChevron());

  const menu = document.createElement("ul");
  menu.setAttribute("role", "listbox");
  menu.className = "ui-select-menu";
  menu.hidden = true;
  if (accessibleLabel) menu.setAttribute("aria-label", accessibleLabel);

  const wrap = document.createElement("div");
  wrap.className = "ui-select";
  select.insertAdjacentElement("beforebegin", wrap);
  wrap.append(trigger, select);
  document.body.append(menu);

  // Visually hidden, not `hidden`/`display:none`: the native select stays a
  // real, "visible" element (zero-opacity, 1px, pointer-events:none) so it
  // keeps working as the accessible/automatable fallback path — screen
  // readers and Playwright's selectOption() (which requires an actionable,
  // non-display:none element) both keep operating on it directly. Real
  // pointer/keyboard users only ever reach the custom trigger (tabIndex -1
  // takes it out of Tab order); its own `change` event re-syncs the custom
  // UI no matter which path changed the value.
  select.classList.add("ui-select-native");
  select.tabIndex = -1;
  select.addEventListener("change", () => api.sync());

  let items = [];
  let typeaheadBuffer = "";
  let typeaheadTimer = null;

  function syncTrigger() {
    const opt = select.options[select.selectedIndex];
    triggerText.textContent = opt ? opt.text : "";
    trigger.disabled = select.disabled;
    trigger.classList.toggle("is-disabled", select.disabled);
  }

  // Canonical single-select grammar (same rule as the approved discipline
  // context switcher): TRIGGER = current value, MENU = alternatives only.
  // The current value never appears a second time inside its own open menu
  // — no highlighted "selected" row, no checkmark, nothing to skip past.
  function buildItems() {
    menu.replaceChildren();
    const currentIndex = select.selectedIndex;
    items = optionsOf(select)
      .filter((opt) => opt.index !== currentIndex)
      .map((opt) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        li.className = "ui-select-item";
        li.textContent = opt.text;
        li.dataset.index = String(opt.index);
        li.id = `${select.id || "ui-select"}-opt-${opt.index}`;
        if (opt.disabled) {
          li.setAttribute("aria-disabled", "true");
          li.classList.add("is-disabled");
        }
        li.tabIndex = -1;
        menu.append(li);
        return li;
      });
  }

  function setActiveDescendant(index) {
    const item = items[index];
    if (!item) return;
    menu.setAttribute("aria-activedescendant", item.id);
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
    setActiveDescendant(0);
    menu.tabIndex = 0;
    menu.focus({ preventScroll: true });
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
  }

  function closeMenu(returnFocus) {
    if (!isOpen()) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.classList.remove("is-open");
    window.removeEventListener("resize", positionMenu);
    window.removeEventListener("scroll", positionMenu, true);
    if (returnFocus) trigger.focus();
  }

  // `realIndex` is the target option's own index in select.options (stored
  // as each <li>'s data-index) — distinct from its position in `items`,
  // since `items` is the filtered (current value excluded) list.
  function commitRealIndex(realIndex) {
    const opt = select.options[realIndex];
    if (!opt || opt.disabled) return;
    const changed = select.selectedIndex !== realIndex;
    select.selectedIndex = realIndex;
    syncTrigger();
    closeMenu(true);
    if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function focusedIndex() {
    const current = items.findIndex((it) => it.classList.contains("is-focused"));
    return current >= 0 ? current : 0;
  }

  function moveFocus(delta) {
    if (!items.length) return;
    let next = focusedIndex();
    for (let step = 0; step < items.length; step++) {
      next = (next + delta + items.length) % items.length;
      if (!items[next].classList.contains("is-disabled")) break;
    }
    setActiveDescendant(next);
  }

  function jumpFocus(toEnd) {
    if (!items.length) return;
    if (!toEnd) {
      const first = items.findIndex((it) => !it.classList.contains("is-disabled"));
      if (first >= 0) setActiveDescendant(first);
    } else {
      for (let i = items.length - 1; i >= 0; i--) {
        if (!items[i].classList.contains("is-disabled")) {
          setActiveDescendant(i);
          break;
        }
      }
    }
  }

  function typeahead(char) {
    clearTimeout(typeaheadTimer);
    typeaheadBuffer += char.toLowerCase();
    typeaheadTimer = setTimeout(() => (typeaheadBuffer = ""), 500);
    const start = (focusedIndex() + 1) % items.length;
    for (let step = 0; step < items.length; step++) {
      const idx = (start + step) % items.length;
      if (items[idx].classList.contains("is-disabled")) continue;
      if (items[idx].textContent.toLowerCase().startsWith(typeaheadBuffer)) {
        setActiveDescendant(idx);
        return;
      }
    }
  }

  trigger.addEventListener("click", () => (isOpen() ? closeMenu(true) : openMenu()));
  trigger.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openMenu();
    }
  });

  menu.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        closeMenu(true);
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
      case " ":
        event.preventDefault();
        if (items[focusedIndex()]) commitRealIndex(Number(items[focusedIndex()].dataset.index));
        return;
      case "Tab":
        closeMenu(false);
        return;
      default:
        if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
          typeahead(event.key);
        }
    }
  });

  menu.addEventListener("click", (event) => {
    const li = event.target.closest("li[role=option]");
    if (!li) return;
    commitRealIndex(Number(li.dataset.index));
  });

  document.addEventListener("click", (event) => {
    if (!isOpen()) return;
    if (trigger.contains(event.target) || menu.contains(event.target)) return;
    closeMenu(false);
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
