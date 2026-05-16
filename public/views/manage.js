// CMS view: unified management of muscle groups and exercises.
//
// Left sidebar = muscle-group filter. "Alle" shows the full library; a
// specific group filters and surfaces the group's own editor (name + color
// + delete) above its exercises.

import { openModal, openConfirmModal, openAlertModal } from "../modal.js";
import { scheduleSavePlans, shortId, state } from "../state.js";
import { escape, findMg } from "../util.js";
import { DEFAULT_COLOR_KEY, PALETTE } from "../palette.js";

// "all" | "none" (orphans) | <muscleGroupId>
let selectedFilter = "all";
let searchText = "";

export function render(root, ctx) {
  root.innerHTML = "";
  renderModeActions(ctx);

  const wrap = document.createElement("div");
  wrap.className = "manage";

  const layout = document.createElement("div");
  layout.className = "manage-layout";
  wrap.appendChild(layout);

  renderSidebar(layout, root, ctx);
  renderMain(layout, root, ctx);

  root.appendChild(wrap);
}

function renderModeActions(ctx) {
  if (!ctx || !ctx.modeActions) return;
  ctx.modeActions.innerHTML = "";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "icon-btn round";
  back.title = "Fertig";
  back.setAttribute("aria-label", "Zurück zum Planer");
  back.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  `;
  back.onclick = () => ctx.switchMode("edit");
  ctx.modeActions.appendChild(back);
}

// --- Sidebar --------------------------------------------------------------

function renderSidebar(layout, root, ctx) {
  const rerender = () => render(root, ctx);
  const mgs = state.plans.muscleGroups || [];
  const library = state.plans.exerciseLibrary || [];

  const sidebar = document.createElement("aside");
  sidebar.className = "manage-list";

  const ul = document.createElement("ul");
  ul.className = "manage-list-items";

  ul.appendChild(filterRow("Alle", null, library.length, "all", rerender));

  const orphanCount = library.filter((e) => !e.muscleGroupId).length;
  if (orphanCount > 0) {
    ul.appendChild(filterRow("Ohne Gruppe", null, orphanCount, "none", rerender));
  }

  if (mgs.length > 0) {
    const divider = document.createElement("li");
    divider.className = "manage-list-divider";
    divider.setAttribute("aria-hidden", "true");
    ul.appendChild(divider);
  }

  for (const mg of mgs) {
    const count = library.filter((e) => e.muscleGroupId === mg.id).length;
    ul.appendChild(filterRow(mg.name, mg.colorKey, count, mg.id, rerender));
  }

  // Add-row at the bottom, styled as a ghost action.
  const addLi = document.createElement("li");
  const addBtn = document.createElement("button");
  addBtn.className = "manage-list-add";
  addBtn.innerHTML = `<span aria-hidden="true">+</span><span>Muskelgruppe</span>`;
  addBtn.onclick = () => openCreateMgModal(rerender);
  addLi.appendChild(addBtn);
  ul.appendChild(addLi);

  sidebar.appendChild(ul);
  layout.appendChild(sidebar);
}

function filterRow(label, colorKey, count, value, rerender) {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.className = "manage-list-row" + (selectedFilter === value ? " active" : "");
  btn.innerHTML = `
    <span class="mg-swatch"${colorKey ? ` data-mg-color="${escape(colorKey)}"` : ""} aria-hidden="true"></span>
    <span class="manage-list-name">${escape(label)}</span>
    <span class="manage-list-meta">${count}</span>
  `;
  btn.onclick = () => { selectedFilter = value; rerender(); };
  li.appendChild(btn);
  return li;
}

// --- Main pane ------------------------------------------------------------

function renderMain(layout, root, ctx) {
  const rerender = () => render(root, ctx);
  const main = document.createElement("section");
  main.className = "manage-exlayout";

  const mgs = state.plans.muscleGroups || [];
  const library = state.plans.exerciseLibrary || [];

  // Resolve filter: if it pointed at a deleted MG, fall back to "all".
  let selectedMg = null;
  if (selectedFilter !== "all" && selectedFilter !== "none") {
    selectedMg = mgs.find((m) => m.id === selectedFilter) || null;
    if (!selectedMg) { selectedFilter = "all"; }
  }

  // Group header (only when a specific MG is selected).
  if (selectedMg) {
    main.appendChild(renderMgHeader(selectedMg, rerender));
  }

  // Toolbar: search + add
  const toolbar = document.createElement("div");
  toolbar.className = "manage-ex-toolbar";

  const search = document.createElement("input");
  search.type = "text";
  search.className = "manage-ex-search";
  search.placeholder = selectedMg
    ? `In „${selectedMg.name}" suchen…`
    : "Übung suchen…";
  search.value = searchText;
  search.autocomplete = "off";
  search.spellcheck = false;
  search.addEventListener("input", () => {
    searchText = search.value;
    renderRows();
  });
  toolbar.appendChild(search);

  const addBtn = document.createElement("button");
  addBtn.className = "btn secondary";
  addBtn.textContent = "+ Übung";
  addBtn.onclick = () => {
    const baseName = "Neue Übung";
    let name = baseName;
    let n = 2;
    while (library.find((e) => e.name === name)) name = `${baseName} ${n++}`;
    const ex = {
      id: shortId("le_"),
      name,
      muscleGroupId: selectedMg ? selectedMg.id : null,
    };
    state.plans.exerciseLibrary.push(ex);
    scheduleSavePlans();
    rerender();
    setTimeout(() => {
      const el = document.querySelector(
        `.manage-ex-row[data-ex-id="${ex.id}"] .manage-ex-name`,
      );
      if (el) { el.focus(); el.select(); }
    }, 0);
  };
  toolbar.appendChild(addBtn);
  main.appendChild(toolbar);

  const listEl = document.createElement("ul");
  listEl.className = "manage-ex-list";
  main.appendChild(listEl);

  function renderRows() {
    listEl.innerHTML = "";
    const q = searchText.trim().toLowerCase();
    const items = library.filter((e) => {
      if (selectedFilter === "none") {
        if (e.muscleGroupId) return false;
      } else if (selectedMg) {
        if (e.muscleGroupId !== selectedMg.id) return false;
      }
      if (!q) return true;
      const mg = findMg(state.plans, e.muscleGroupId);
      return (
        e.name.toLowerCase().includes(q) ||
        (mg ? mg.name.toLowerCase().includes(q) : false)
      );
    }).sort((a, b) => a.name.localeCompare(b.name));

    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "manage-empty";
      li.textContent = q
        ? "Keine Treffer."
        : selectedMg
          ? "Noch keine Übungen in dieser Muskelgruppe."
          : selectedFilter === "none"
            ? "Alle Übungen sind einer Muskelgruppe zugeordnet."
            : "Noch keine Übungen.";
      listEl.appendChild(li);
      return;
    }
    for (const ex of items) listEl.appendChild(renderExRow(ex, rerender));
  }

  renderRows();
  layout.appendChild(main);
}

// --- Muscle-group header (inline editor when a group is selected) --------

function renderMgHeader(mg, rerender) {
  const header = document.createElement("div");
  header.className = "manage-mg-header";
  header.dataset.mgColor = mg.colorKey;

  // Row 1: name + delete
  const top = document.createElement("div");
  top.className = "manage-mg-header-top";

  const nameInp = document.createElement("input");
  nameInp.type = "text";
  nameInp.className = "manage-mg-name";
  nameInp.value = mg.name;
  nameInp.spellcheck = false;
  let nameBefore = mg.name;
  nameInp.addEventListener("focus", () => { nameBefore = mg.name; });
  nameInp.addEventListener("blur", () => {
    const v = nameInp.value.trim();
    if (!v) { nameInp.value = nameBefore; return; }
    if (v !== mg.name) {
      mg.name = v;
      scheduleSavePlans();
      rerender();
    }
  });
  nameInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") nameInp.blur();
    if (e.key === "Escape") { nameInp.value = nameBefore; nameInp.blur(); }
  });
  top.appendChild(nameInp);

  const del = document.createElement("button");
  del.className = "btn ghost danger";
  del.textContent = "Löschen";
  del.title = "Muskelgruppe löschen";
  del.onclick = () => deleteMg(mg, rerender);
  top.appendChild(del);
  header.appendChild(top);

  // Row 2: color picker
  const colorWrap = document.createElement("div");
  colorWrap.className = "manage-mg-color";
  const lbl = document.createElement("span");
  lbl.className = "manage-mg-color-label";
  lbl.textContent = "Farbe";
  colorWrap.appendChild(lbl);

  const grid = document.createElement("div");
  grid.className = "manage-color-grid inline";
  for (const slot of PALETTE) {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "manage-color-slot" + (slot.key === mg.colorKey ? " active" : "");
    sw.dataset.mgColor = slot.key;
    sw.title = slot.label;
    sw.textContent = "Aa";
    sw.setAttribute("aria-label", `Farbe: ${slot.label}`);
    sw.onclick = () => {
      mg.colorKey = slot.key;
      scheduleSavePlans();
      rerender();
    };
    grid.appendChild(sw);
  }
  colorWrap.appendChild(grid);
  header.appendChild(colorWrap);

  return header;
}

function deleteMg(mg, rerender) {
  const inLibrary = countExercisesInMg(mg.id);
  const inPlans = countPlanExercisesUsingMg(mg.id);
  const message = inLibrary || inPlans
    ? `„${mg.name}" wirklich löschen?\n\n${inLibrary} Bibliotheks-Übung(en) und ${inPlans} Plan-Übung(en) werden „ohne Muskelgruppe".`
    : `„${mg.name}" wirklich löschen?`;
  openConfirmModal({
    title: "Muskelgruppe löschen",
    message,
    onConfirm: () => doDeleteMg(mg, rerender),
  });
}

function doDeleteMg(mg, rerender) {
  for (const ex of state.plans.exerciseLibrary || []) {
    if (ex.muscleGroupId === mg.id) ex.muscleGroupId = null;
  }
  for (const plan of state.plans.plans || []) {
    for (const day of plan.days || []) {
      for (const ex of day.exercises || []) {
        if (ex.muscleGroupId === mg.id) ex.muscleGroupId = null;
      }
    }
  }
  state.plans.muscleGroups = (state.plans.muscleGroups || []).filter(
    (m) => m.id !== mg.id,
  );
  if (selectedFilter === mg.id) selectedFilter = "all";
  scheduleSavePlans();
  rerender();
}

// --- Exercise row (inline edit) ------------------------------------------

function renderExRow(ex, rerender) {
  const mg = findMg(state.plans, ex.muscleGroupId);
  const li = document.createElement("li");
  li.className = "manage-ex-row";
  li.dataset.exId = ex.id;

  const swatch = document.createElement("span");
  swatch.className = "mg-swatch";
  if (mg) swatch.dataset.mgColor = mg.colorKey;
  swatch.setAttribute("aria-hidden", "true");
  li.appendChild(swatch);

  const nameInp = document.createElement("input");
  nameInp.type = "text";
  nameInp.className = "manage-ex-name";
  nameInp.value = ex.name;
  nameInp.spellcheck = false;
  let nameBefore = ex.name;
  nameInp.addEventListener("focus", () => { nameBefore = ex.name; });
  nameInp.addEventListener("blur", () => {
    const v = nameInp.value.trim();
    if (!v) { nameInp.value = nameBefore; return; }
    if (v === ex.name) return;
    const oldName = ex.name;
    ex.name = v;
    // Plan-exercises store their own name copy — keep entries that look like
    // this library item (same name + same muscleGroupId) in sync.
    for (const plan of state.plans.plans || []) {
      for (const day of plan.days || []) {
        for (const pex of day.exercises || []) {
          if (pex.name === oldName && pex.muscleGroupId === ex.muscleGroupId) {
            pex.name = v;
          }
        }
      }
    }
    scheduleSavePlans();
  });
  nameInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") nameInp.blur();
    if (e.key === "Escape") { nameInp.value = nameBefore; nameInp.blur(); }
  });
  li.appendChild(nameInp);

  const sel = document.createElement("select");
  sel.className = "manage-ex-mg-select";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "— keine —";
  if (!ex.muscleGroupId) none.selected = true;
  sel.appendChild(none);
  for (const m of state.plans.muscleGroups || []) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    if (ex.muscleGroupId === m.id) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.onchange = () => {
    const oldMgId = ex.muscleGroupId;
    const newMgId = sel.value || null;
    ex.muscleGroupId = newMgId;
    syncPlanInstancesMg(ex.name, oldMgId, newMgId);
    scheduleSavePlans();
    rerender();
  };
  li.appendChild(sel);

  const del = document.createElement("button");
  del.className = "icon-btn";
  del.title = "Übung löschen";
  del.setAttribute("aria-label", "Übung löschen");
  del.textContent = "✕";
  del.onclick = () => {
    const used = countPlanExercisesUsingExerciseName(ex.name);
    const message = used
      ? `„${ex.name}" aus der Bibliothek löschen?\n\n${used} Plan-Übung(en) mit gleichem Namen bleiben unverändert in den Plänen.`
      : `„${ex.name}" aus der Bibliothek löschen?`;
    openConfirmModal({
      title: "Übung löschen",
      message,
      onConfirm: () => {
        state.plans.exerciseLibrary = (state.plans.exerciseLibrary || []).filter(
          (e) => e.id !== ex.id,
        );
        scheduleSavePlans();
        rerender();
      },
    });
  };
  li.appendChild(del);

  return li;
}

// --- Create-MG modal -----------------------------------------------------

function openCreateMgModal(rerender) {
  const mgs = state.plans.muscleGroups || [];
  const library = state.plans.exerciseLibrary || [];

  let colorKey = nextFreeColor(mgs);
  const selectedExIds = new Set();
  // Newly-typed exercises live here until the user confirms; on cancel they
  // never touch the library.
  const pendingNew = []; // [{ id, name }]

  const body = document.createElement("div");
  body.className = "create-mg-form";

  // Name
  const nameRow = document.createElement("label");
  nameRow.className = "form-row";
  nameRow.innerHTML = `<span>Name</span>`;
  const nameInp = document.createElement("input");
  nameInp.type = "text";
  nameInp.id = "newmg-name";
  nameInp.placeholder = "z.B. Brust";
  nameInp.autocomplete = "off";
  nameRow.appendChild(nameInp);
  body.appendChild(nameRow);

  // Color picker
  const colorWrap = document.createElement("div");
  colorWrap.className = "form-row";
  const colorLbl = document.createElement("span");
  colorLbl.textContent = "Farbe";
  colorWrap.appendChild(colorLbl);
  const grid = document.createElement("div");
  grid.className = "manage-color-grid inline";
  const slotBtns = [];
  for (const slot of PALETTE) {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "manage-color-slot" + (slot.key === colorKey ? " active" : "");
    sw.dataset.mgColor = slot.key;
    sw.title = slot.label;
    sw.textContent = "Aa";
    sw.setAttribute("aria-label", `Farbe: ${slot.label}`);
    sw.onclick = () => {
      colorKey = slot.key;
      for (const b of slotBtns) {
        b.classList.toggle("active", b.dataset.mgColor === colorKey);
      }
    };
    slotBtns.push(sw);
    grid.appendChild(sw);
  }
  colorWrap.appendChild(grid);
  body.appendChild(colorWrap);

  // Exercises (optional). Show unassigned by default; toggle to show all.
  const exWrap = document.createElement("div");
  exWrap.className = "form-row create-mg-exercises";

  const exHead = document.createElement("div");
  exHead.className = "create-mg-ex-head";
  const exLbl = document.createElement("span");
  exLbl.textContent = "Übungen zuweisen";
  exHead.appendChild(exLbl);

  let showAll = false;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "btn ghost btn-tiny";
  toggle.textContent = "Alle anzeigen";
  toggle.onclick = () => {
    showAll = !showAll;
    toggle.textContent = showAll ? "Nur ohne Gruppe" : "Alle anzeigen";
    renderExList();
  };
  exHead.appendChild(toggle);
  exWrap.appendChild(exHead);

  // Quick-add input — type a name, hit Enter or "+" to add it to the list
  // pre-selected. Never persisted to the library unless the modal is confirmed.
  const quickAdd = document.createElement("div");
  quickAdd.className = "create-mg-ex-add";
  const quickInp = document.createElement("input");
  quickInp.type = "text";
  quickInp.placeholder = "Neue Übung eintippen…";
  quickInp.autocomplete = "off";
  quickInp.spellcheck = false;
  const quickBtn = document.createElement("button");
  quickBtn.type = "button";
  quickBtn.className = "btn secondary btn-tiny";
  quickBtn.textContent = "+ Hinzufügen";
  quickAdd.appendChild(quickInp);
  quickAdd.appendChild(quickBtn);
  exWrap.appendChild(quickAdd);

  const exList = document.createElement("ul");
  exList.className = "create-mg-ex-list";
  exWrap.appendChild(exList);
  body.appendChild(exWrap);

  function commitQuickAdd() {
    const name = quickInp.value.trim();
    if (!name) return;
    if (
      library.find((e) => e.name === name) ||
      pendingNew.find((e) => e.name === name)
    ) {
      openAlertModal({
        title: "Name vergeben",
        message: `„${name}" existiert bereits.`,
      });
      return;
    }
    const id = shortId("le_");
    pendingNew.push({ id, name });
    selectedExIds.add(id);
    quickInp.value = "";
    renderExList();
    quickInp.focus();
  }
  quickBtn.onclick = commitQuickAdd;
  quickInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commitQuickAdd(); }
  });

  function renderExList() {
    exList.innerHTML = "";
    const filtered = library.filter((e) => showAll || !e.muscleGroupId);
    const items = [
      ...pendingNew.map((p) => ({ ...p, _pending: true })),
      ...filtered,
    ].sort((a, b) => a.name.localeCompare(b.name));

    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "create-mg-ex-empty";
      li.textContent = showAll
        ? "Bibliothek ist leer. Übungen oben eintippen."
        : "Alle Übungen sind bereits zugeordnet. Neue oben eintippen.";
      exList.appendChild(li);
      return;
    }
    for (const ex of items) {
      const li = document.createElement("li");
      const lab = document.createElement("label");
      lab.className = "create-mg-ex-row";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selectedExIds.has(ex.id);
      cb.onchange = () => {
        if (cb.checked) selectedExIds.add(ex.id);
        else selectedExIds.delete(ex.id);
      };
      lab.appendChild(cb);

      const nameSpan = document.createElement("span");
      nameSpan.className = "create-mg-ex-name";
      nameSpan.textContent = ex.name;
      lab.appendChild(nameSpan);

      const meta = document.createElement("span");
      meta.className = "create-mg-ex-meta";
      if (ex._pending) {
        meta.textContent = "neu";
        meta.classList.add("is-new");
      } else {
        const currentMg = findMg(state.plans, ex.muscleGroupId);
        if (currentMg) meta.textContent = currentMg.name;
      }
      if (meta.textContent) lab.appendChild(meta);

      li.appendChild(lab);
      exList.appendChild(li);
    }
  }
  renderExList();

  const m = openModal({
    title: "Neue Muskelgruppe",
    body,
    confirmLabel: "Erstellen",
    confirmDisabled: true,
    onConfirm: () => {
      const name = nameInp.value.trim();
      if (!name) return false;
      if (mgs.find((mg) => mg.name === name)) {
        openAlertModal({
          title: "Name vergeben",
          message: "Eine Muskelgruppe mit diesem Namen existiert bereits.",
        });
        return false;
      }
      const mg = { id: shortId("mg_"), name, colorKey };
      state.plans.muscleGroups.push(mg);
      // Commit pending new exercises into the library (assigned to this group
      // if checked, otherwise left unassigned).
      for (const p of pendingNew) {
        const newMgId = selectedExIds.has(p.id) ? mg.id : null;
        state.plans.exerciseLibrary.push({
          id: p.id,
          name: p.name,
          muscleGroupId: newMgId,
        });
        if (newMgId) syncPlanInstancesMg(p.name, null, newMgId);
      }
      // Assign existing exercises that were checked.
      for (const ex of library) {
        if (selectedExIds.has(ex.id)) {
          const oldMgId = ex.muscleGroupId;
          ex.muscleGroupId = mg.id;
          syncPlanInstancesMg(ex.name, oldMgId, mg.id);
        }
      }
      selectedFilter = mg.id;
      scheduleSavePlans();
      rerender();
    },
  });

  nameInp.addEventListener("input", () =>
    m.setConfirmEnabled(nameInp.value.trim().length > 0),
  );
  nameInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && nameInp.value.trim()) {
      e.preventDefault();
      m.modal.querySelector("[data-confirm]").click();
    }
  });
  nameInp.focus();
}

// --- Helpers --------------------------------------------------------------

function nextFreeColor(mgs) {
  const used = new Set(mgs.map((m) => m.colorKey));
  for (const slot of PALETTE) if (!used.has(slot.key)) return slot.key;
  return DEFAULT_COLOR_KEY;
}

function countExercisesInMg(mgId) {
  return (state.plans.exerciseLibrary || []).filter(
    (e) => e.muscleGroupId === mgId,
  ).length;
}

function countPlanExercisesUsingMg(mgId) {
  let n = 0;
  for (const p of state.plans.plans || []) {
    for (const d of p.days || []) {
      for (const e of d.exercises || []) {
        if (e.muscleGroupId === mgId) n++;
      }
    }
  }
  return n;
}

function syncPlanInstancesMg(exerciseName, oldMgId, newMgId) {
  for (const plan of state.plans.plans || []) {
    for (const day of plan.days || []) {
      for (const pex of day.exercises || []) {
        if (pex.name === exerciseName && pex.muscleGroupId === oldMgId) {
          pex.muscleGroupId = newMgId;
        }
      }
    }
  }
}

function countPlanExercisesUsingExerciseName(name) {
  let n = 0;
  for (const p of state.plans.plans || []) {
    for (const d of p.days || []) {
      for (const e of d.exercises || []) {
        if (e.name === name) n++;
      }
    }
  }
  return n;
}
