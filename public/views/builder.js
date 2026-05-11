// Builder view: create and edit weekly training plans.
// Multiple plans per user, each plan = one training week with up to 7 days.
// Layout: sidebar (plan list) + main (plan editor with day columns).

import {
  state,
  scheduleSavePlans,
  setCompactView,
  shortId,
} from "../state.js";
import { escape } from "../util.js";

const MAX_DAYS = 7;
const SUGGESTED_DAY_NAMES = [
  "Push", "Pull", "Beine",
  "Push 2", "Pull 2",
  "OK", "UK",
  "Oberkörper", "Unterkörper",
  "Brust", "Rücken", "Schulter", "Arme",
  "Ganzkörper",
];

export function render(root) {
  root.innerHTML = "";
  const layout = document.createElement("div");
  layout.className = "builder-layout";

  const sidebar = document.createElement("aside");
  sidebar.className = "builder-sidebar";
  layout.appendChild(sidebar);

  const main = document.createElement("section");
  main.className = "builder-main";
  layout.appendChild(main);

  root.appendChild(layout);

  const rerender = () => render(root);

  // Ensure activePlanId is valid; fall back to most-recent plan or null.
  const plans = state.plans.plans || [];
  if (state.activePlanId && !plans.find((p) => p.id === state.activePlanId)) {
    state.activePlanId = null;
  }
  if (!state.activePlanId && plans.length > 0) {
    state.activePlanId = mostRecent(plans).id;
  }

  renderSidebar(sidebar, rerender);

  const active = plans.find((p) => p.id === state.activePlanId);
  if (!active) renderEmptyState(main, rerender);
  else renderEditor(main, active, rerender);
}

function mostRecent(plans) {
  return [...plans].sort((a, b) =>
    (b.updatedAt || "").localeCompare(a.updatedAt || "")
  )[0];
}

// --- Sidebar ----------------------------------------------------------------

function renderSidebar(root, rerender) {
  const plans = [...(state.plans.plans || [])].sort((a, b) =>
    (b.updatedAt || "").localeCompare(a.updatedAt || "")
  );

  const head = document.createElement("div");
  head.className = "builder-sidebar-head";
  const newBtn = document.createElement("button");
  newBtn.className = "btn";
  newBtn.textContent = "+ Neuer Plan";
  newBtn.onclick = () => openCreatePlanModal(rerender);
  head.appendChild(newBtn);
  root.appendChild(head);

  const title = document.createElement("div");
  title.className = "builder-sidebar-title";
  title.textContent = plans.length ? "Pläne" : "";
  root.appendChild(title);

  const list = document.createElement("ul");
  list.className = "builder-plan-list";
  for (const p of plans) {
    list.appendChild(renderPlanRow(p, rerender));
  }
  root.appendChild(list);
}

function renderPlanRow(plan, rerender) {
  const li = document.createElement("li");
  li.className =
    "builder-plan-row" + (plan.id === state.activePlanId ? " active" : "");

  const label = document.createElement("button");
  label.className = "builder-plan-label";
  label.textContent = plan.name;
  label.onclick = () => {
    state.activePlanId = plan.id;
    rerender();
  };
  li.appendChild(label);

  const menu = document.createElement("button");
  menu.className = "builder-plan-menu";
  menu.title = "Aktionen";
  menu.setAttribute("aria-label", "Plan-Aktionen");
  menu.textContent = "⋯";
  menu.onclick = (e) => {
    e.stopPropagation();
    openPlanMenu(menu, plan, rerender);
  };
  li.appendChild(menu);

  return li;
}

function openPlanMenu(anchor, plan, rerender) {
  closeAnyPopover();
  const pop = document.createElement("div");
  pop.className = "popover";
  const r = anchor.getBoundingClientRect();
  pop.style.top = `${r.bottom + 4}px`;
  pop.style.left = `${Math.min(r.left, window.innerWidth - 200)}px`;

  const item = (label, fn) => {
    const b = document.createElement("button");
    b.className = "popover-item";
    b.textContent = label;
    b.onclick = () => {
      pop.remove();
      document.removeEventListener("click", outside, true);
      fn();
    };
    return b;
  };

  pop.appendChild(item("Umbenennen", () => renamePlanPrompt(plan, rerender)));
  pop.appendChild(item("Kopieren", () => copyPlan(plan, rerender)));
  pop.appendChild(item("Löschen", () => deletePlan(plan, rerender)));
  document.body.appendChild(pop);

  const outside = (e) => {
    if (!pop.contains(e.target)) {
      pop.remove();
      document.removeEventListener("click", outside, true);
    }
  };
  setTimeout(() => document.addEventListener("click", outside, true), 0);
}

function closeAnyPopover() {
  document.querySelectorAll(".popover").forEach((el) => el.remove());
}

// --- Empty state ------------------------------------------------------------

function renderEmptyState(root, rerender) {
  const wrap = document.createElement("div");
  wrap.className = "builder-empty";
  wrap.innerHTML = `
    <h2>Noch kein Plan</h2>
    <p>Lege deinen ersten Trainingsplan an. Er besteht aus bis zu 7 Trainingstagen mit beliebigen Übungen.</p>
  `;
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = "Ersten Plan erstellen";
  btn.onclick = () => openCreatePlanModal(rerender);
  wrap.appendChild(btn);
  root.appendChild(wrap);
}

// --- Editor (active plan) ---------------------------------------------------

function renderEditor(root, plan, rerender) {
  const header = document.createElement("div");
  header.className = "builder-plan-header";

  const nameInput = document.createElement("input");
  nameInput.className = "builder-plan-name";
  nameInput.value = plan.name;
  nameInput.spellcheck = false;
  let nameBefore = plan.name;
  nameInput.addEventListener("focus", () => {
    nameBefore = plan.name;
  });
  nameInput.addEventListener("blur", () => {
    const v = nameInput.value.trim();
    if (!v) {
      nameInput.value = nameBefore;
      return;
    }
    if (v !== plan.name) {
      plan.name = v;
      plan.updatedAt = new Date().toISOString();
      scheduleSavePlans();
      rerender();
    }
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") nameInput.blur();
    if (e.key === "Escape") {
      nameInput.value = nameBefore;
      nameInput.blur();
    }
  });
  header.appendChild(nameInput);

  const actions = document.createElement("div");
  actions.className = "builder-plan-actions";

  const compactBtn = document.createElement("button");
  compactBtn.className =
    "btn ghost compact-toggle" + (state.compactView ? " active" : "");
  compactBtn.setAttribute("aria-pressed", state.compactView ? "true" : "false");
  compactBtn.title = state.compactView
    ? "Detailansicht zeigen"
    : "Kompakte Ansicht zeigen";
  compactBtn.innerHTML = `<span class="compact-icon" aria-hidden="true"></span><span>Kompakt</span>`;
  compactBtn.onclick = () => {
    setCompactView(!state.compactView);
    rerender();
  };
  actions.appendChild(compactBtn);

  const copyBtn = document.createElement("button");
  copyBtn.className = "btn secondary";
  copyBtn.textContent = "Kopieren";
  copyBtn.onclick = () => copyPlan(plan, rerender);
  actions.appendChild(copyBtn);

  const delBtn = document.createElement("button");
  delBtn.className = "btn ghost danger";
  delBtn.textContent = "Löschen";
  delBtn.onclick = () => deletePlan(plan, rerender);
  actions.appendChild(delBtn);
  header.appendChild(actions);

  root.appendChild(header);

  const board = document.createElement("div");
  board.className = "builder-board" + (state.compactView ? " compact" : "");

  for (const day of plan.days) {
    board.appendChild(renderDayColumn(plan, day, rerender));
  }

  if (plan.days.length < MAX_DAYS) {
    board.appendChild(renderAddDayColumn(plan, rerender));
  }

  root.appendChild(board);
}

function renderDayColumn(plan, day, rerender) {
  const col = document.createElement("div");
  col.className = "builder-day";
  col.dataset.dayId = day.id;

  const head = document.createElement("div");
  head.className = "builder-day-head";

  const name = document.createElement("button");
  name.className = "builder-day-name";
  name.textContent = day.name;
  name.title = "Tag umbenennen";
  name.onclick = () => openRenameDayModal(day, rerender);
  head.appendChild(name);

  const del = document.createElement("button");
  del.className = "icon-btn";
  del.title = "Tag entfernen";
  del.setAttribute("aria-label", "Tag entfernen");
  del.textContent = "✕";
  del.onclick = () => {
    if (!confirm(`Trainingstag „${day.name}" mit ${day.exercises.length} Übung(en) entfernen?`)) return;
    plan.days = plan.days.filter((d) => d.id !== day.id);
    plan.updatedAt = new Date().toISOString();
    scheduleSavePlans();
    rerender();
  };
  head.appendChild(del);
  col.appendChild(head);

  const body = document.createElement("div");
  body.className = "builder-day-body";
  body.dataset.dayId = day.id;

  for (const ex of day.exercises) {
    body.appendChild(renderExerciseBox(plan, day, ex, rerender));
  }

  // Drop-zone "tail" so users can drop at the very end of the column.
  const tail = document.createElement("div");
  tail.className = "builder-drop-tail";
  tail.dataset.dayId = day.id;
  tail.addEventListener("dragover", (e) => {
    if (!state.builderDragging) return;
    e.preventDefault();
    tail.classList.add("drop-target");
  });
  tail.addEventListener("dragleave", () => tail.classList.remove("drop-target"));
  tail.addEventListener("drop", (e) => {
    e.preventDefault();
    tail.classList.remove("drop-target");
    handleDropOnTail(plan, day, rerender);
  });
  body.appendChild(tail);

  col.appendChild(body);

  const add = document.createElement("button");
  add.className = "btn secondary builder-add-exercise";
  add.textContent = "+ Übung";
  add.onclick = () => openAddExerciseModal(plan, day, rerender);
  col.appendChild(add);

  return col;
}

function renderAddDayColumn(plan, rerender) {
  const col = document.createElement("button");
  col.className = "builder-add-day";
  col.innerHTML = `<span class="builder-add-day-icon">+</span><span>Trainingstag</span>`;
  col.onclick = () => openAddDayModal(plan, rerender);
  return col;
}

function renderExerciseBox(plan, day, ex, rerender) {
  const box = document.createElement("article");
  box.className = "exercise-box";
  box.dataset.mg = ex.muscleGroup || "";
  box.dataset.exerciseId = ex.id;
  box.dataset.dayId = day.id;
  box.draggable = true;

  // Drag events on the entire box.
  box.addEventListener("dragstart", (e) => {
    state.builderDragging = { fromDayId: day.id, exerciseId: ex.id };
    box.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", ex.id);
    } catch {
      // Some browsers throw on unusual MIME — non-fatal.
    }
  });
  box.addEventListener("dragend", () => {
    state.builderDragging = null;
    document.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
    document.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
    document.querySelectorAll(".drop-before, .drop-after").forEach((el) => {
      el.classList.remove("drop-before", "drop-after");
    });
  });
  box.addEventListener("dragover", (e) => {
    if (!state.builderDragging) return;
    e.preventDefault();
    const rect = box.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    box.classList.toggle("drop-before", before);
    box.classList.toggle("drop-after", !before);
  });
  box.addEventListener("dragleave", () => {
    box.classList.remove("drop-before", "drop-after");
  });
  box.addEventListener("drop", (e) => {
    e.preventDefault();
    const before = box.classList.contains("drop-before");
    box.classList.remove("drop-before", "drop-after");
    handleDropOnBox(plan, day, ex, before, rerender);
  });

  const head = document.createElement("div");
  head.className = "exercise-box-head";
  head.innerHTML = `
    <span class="drag-handle" aria-hidden="true">⋮⋮</span>
    <div class="exercise-box-titles">
      <div class="exercise-box-name">${escape(ex.name)}</div>
      <div class="exercise-box-mg">${escape(ex.muscleGroup || "—")}</div>
    </div>
  `;
  const remove = document.createElement("button");
  remove.className = "icon-btn";
  remove.title = "Übung entfernen";
  remove.setAttribute("aria-label", "Übung entfernen");
  remove.textContent = "✕";
  remove.onclick = () => {
    if (!confirm(`„${ex.name}" entfernen?`)) return;
    day.exercises = day.exercises.filter((e) => e.id !== ex.id);
    plan.updatedAt = new Date().toISOString();
    scheduleSavePlans();
    rerender();
  };
  head.appendChild(remove);
  box.appendChild(head);

  const inputs = document.createElement("div");
  inputs.className = "exercise-box-inputs";
  inputs.appendChild(field("Sätze", "sets", ex, plan, "numeric"));
  inputs.appendChild(field("Wdh.", "reps", ex, plan, "decimal"));
  inputs.appendChild(field("kg", "weight", ex, plan, "decimal"));
  box.appendChild(inputs);

  return box;
}

function field(label, key, ex, plan, mode) {
  const wrap = document.createElement("label");
  wrap.className = "exercise-box-field";
  const lab = document.createElement("span");
  lab.textContent = label;
  const inp = document.createElement("input");
  inp.type = "text";
  inp.inputMode = mode;
  inp.placeholder = "—";
  inp.value = ex[key] == null ? "" : String(ex[key]);
  inp.addEventListener("input", () => {
    const raw = inp.value.trim();
    if (raw === "") {
      ex[key] = null;
    } else if (key === "sets") {
      const n = parseInt(raw, 10);
      ex[key] = Number.isFinite(n) ? n : null;
    } else {
      ex[key] = raw;
    }
    plan.updatedAt = new Date().toISOString();
    scheduleSavePlans();
  });
  // Don't start a drag when the user is interacting with an input.
  inp.addEventListener("mousedown", (e) => e.stopPropagation());
  wrap.append(lab, inp);
  return wrap;
}

// --- Drag-and-drop handlers -------------------------------------------------

function handleDropOnBox(plan, targetDay, targetEx, before, rerender) {
  const drag = state.builderDragging;
  if (!drag) return;
  const moved = takeExercise(plan, drag.fromDayId, drag.exerciseId);
  if (!moved) return;
  let idx = targetDay.exercises.findIndex((e) => e.id === targetEx.id);
  if (idx < 0) idx = targetDay.exercises.length;
  if (!before) idx += 1;
  targetDay.exercises.splice(idx, 0, moved);
  plan.updatedAt = new Date().toISOString();
  scheduleSavePlans();
  rerender();
}

function handleDropOnTail(plan, targetDay, rerender) {
  const drag = state.builderDragging;
  if (!drag) return;
  const moved = takeExercise(plan, drag.fromDayId, drag.exerciseId);
  if (!moved) return;
  targetDay.exercises.push(moved);
  plan.updatedAt = new Date().toISOString();
  scheduleSavePlans();
  rerender();
}

function takeExercise(plan, dayId, exerciseId) {
  const day = plan.days.find((d) => d.id === dayId);
  if (!day) return null;
  const idx = day.exercises.findIndex((e) => e.id === exerciseId);
  if (idx < 0) return null;
  return day.exercises.splice(idx, 1)[0];
}

// --- Plan operations --------------------------------------------------------

function createPlan(name) {
  const now = new Date().toISOString();
  const plan = {
    id: shortId("p_"),
    name,
    createdAt: now,
    updatedAt: now,
    days: [],
  };
  state.plans.plans.push(plan);
  state.activePlanId = plan.id;
  scheduleSavePlans();
  return plan;
}

function copyPlan(src, rerender) {
  const now = new Date().toISOString();
  const copy = {
    id: shortId("p_"),
    name: `${src.name} (Kopie)`,
    createdAt: now,
    updatedAt: now,
    days: src.days.map((d) => ({
      id: shortId("d_"),
      name: d.name,
      exercises: d.exercises.map((e) => ({ ...e, id: shortId("e_") })),
    })),
  };
  state.plans.plans.push(copy);
  state.activePlanId = copy.id;
  scheduleSavePlans();
  rerender();
}

function deletePlan(plan, rerender) {
  if (!confirm(`Plan „${plan.name}" wirklich löschen?`)) return;
  state.plans.plans = state.plans.plans.filter((p) => p.id !== plan.id);
  if (state.activePlanId === plan.id) state.activePlanId = null;
  scheduleSavePlans();
  rerender();
}

function renamePlanPrompt(plan, rerender) {
  const next = prompt("Neuer Name für den Plan:", plan.name);
  if (next == null) return;
  const v = next.trim();
  if (!v || v === plan.name) return;
  plan.name = v;
  plan.updatedAt = new Date().toISOString();
  scheduleSavePlans();
  rerender();
}

// --- Modals -----------------------------------------------------------------

function openModal({ title, body, onConfirm, confirmLabel = "OK", confirmDisabled = true }) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <h2>${escape(title)}</h2>
    <div class="modal-body"></div>
    <div class="modal-actions">
      <button class="btn secondary" data-cancel>Abbrechen</button>
      <button class="btn" data-confirm ${confirmDisabled ? "disabled" : ""}>${escape(confirmLabel)}</button>
    </div>
  `;
  modal.querySelector(".modal-body").appendChild(body);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const confirmBtn = modal.querySelector("[data-confirm]");
  const setConfirmEnabled = (enabled) => {
    confirmBtn.disabled = !enabled;
  };

  confirmBtn.onclick = () => {
    if (onConfirm() !== false) close();
  };
  modal.querySelector("[data-cancel]").onclick = close;

  const escClose = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", escClose);

  function close() {
    backdrop.remove();
    document.removeEventListener("keydown", escClose);
  }

  return { close, setConfirmEnabled, modal };
}

function openCreatePlanModal(rerender) {
  const body = document.createElement("div");
  body.innerHTML = `
    <p class="modal-hint">Wähle einen Namen für deinen neuen Trainingsplan.</p>
    <input type="text" id="plan-name" placeholder="z.B. Push/Pull/Beine" autocomplete="off" />
  `;
  const m = openModal({
    title: "Neuer Plan",
    body,
    confirmLabel: "Erstellen",
    confirmDisabled: true,
    onConfirm: () => {
      const name = body.querySelector("#plan-name").value.trim();
      if (!name) return false;
      createPlan(name);
      rerender();
    },
  });
  const inp = body.querySelector("#plan-name");
  inp.addEventListener("input", () => m.setConfirmEnabled(inp.value.trim().length > 0));
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && inp.value.trim()) {
      e.preventDefault();
      m.modal.querySelector("[data-confirm]").click();
    }
  });
  inp.focus();
}

function openAddDayModal(plan, rerender) {
  const body = document.createElement("div");
  body.innerHTML = `
    <p class="modal-hint">Wähle einen Vorschlag oder gib einen eigenen Namen ein.</p>
    <div class="pill-row" id="day-suggestions"></div>
    <input type="text" id="day-name" placeholder="Name des Trainingstags" autocomplete="off" />
  `;
  const inp = body.querySelector("#day-name");
  const pills = body.querySelector("#day-suggestions");
  for (const s of SUGGESTED_DAY_NAMES) {
    const pill = document.createElement("button");
    pill.className = "pill";
    pill.textContent = s;
    pill.onclick = () => {
      inp.value = s;
      m.setConfirmEnabled(true);
      inp.focus();
    };
    pills.appendChild(pill);
  }
  const m = openModal({
    title: "Trainingstag hinzufügen",
    body,
    confirmLabel: "Hinzufügen",
    confirmDisabled: true,
    onConfirm: () => {
      const name = inp.value.trim();
      if (!name) return false;
      plan.days.push({ id: shortId("d_"), name, exercises: [] });
      plan.updatedAt = new Date().toISOString();
      scheduleSavePlans();
      rerender();
    },
  });
  inp.addEventListener("input", () => m.setConfirmEnabled(inp.value.trim().length > 0));
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && inp.value.trim()) {
      e.preventDefault();
      m.modal.querySelector("[data-confirm]").click();
    }
  });
  inp.focus();
}

function openRenameDayModal(day, rerender) {
  const body = document.createElement("div");
  body.innerHTML = `
    <input type="text" id="day-name" autocomplete="off" />
  `;
  const inp = body.querySelector("#day-name");
  inp.value = day.name;
  const m = openModal({
    title: "Trainingstag umbenennen",
    body,
    confirmLabel: "Speichern",
    confirmDisabled: false,
    onConfirm: () => {
      const v = inp.value.trim();
      if (!v) return false;
      if (v !== day.name) {
        day.name = v;
        const plan = currentPlan();
        if (plan) plan.updatedAt = new Date().toISOString();
        scheduleSavePlans();
        rerender();
      }
    },
  });
  inp.addEventListener("input", () => m.setConfirmEnabled(inp.value.trim().length > 0));
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && inp.value.trim()) {
      e.preventDefault();
      m.modal.querySelector("[data-confirm]").click();
    }
  });
  setTimeout(() => inp.select(), 0);
}

function openAddExerciseModal(plan, day, rerender) {
  let activeFilter = null; // muscleGroup name or null
  const body = document.createElement("div");
  body.innerHTML = `
    <input type="text" id="ex-search" placeholder="Suchen…" autocomplete="off" />
    <div class="pill-row" id="ex-mg-filters"></div>
    <ul class="exercise-list" id="ex-list"></ul>
    <div class="modal-divider"></div>
    <button class="btn ghost" id="ex-custom">+ Eigene Übung erstellen</button>
  `;

  const filters = body.querySelector("#ex-mg-filters");
  const list = body.querySelector("#ex-list");
  const search = body.querySelector("#ex-search");
  const customBtn = body.querySelector("#ex-custom");

  const refreshFilters = () => {
    filters.innerHTML = "";
    const mgs = state.plans.muscleGroups || [];
    for (const mg of mgs) {
      const pill = document.createElement("button");
      pill.className = "pill mg-pill" + (activeFilter === mg.name ? " active" : "");
      pill.dataset.mg = mg.name;
      pill.textContent = mg.name;
      pill.onclick = () => {
        activeFilter = activeFilter === mg.name ? null : mg.name;
        refreshFilters();
        renderList();
      };
      filters.appendChild(pill);
    }
  };

  const renderList = () => {
    const q = search.value.trim().toLowerCase();
    list.innerHTML = "";
    const items = (state.plans.exerciseLibrary || []).filter((e) => {
      if (activeFilter && e.muscleGroup !== activeFilter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        (e.muscleGroup || "").toLowerCase().includes(q)
      );
    });
    if (items.length === 0) {
      const li = document.createElement("li");
      li.textContent = "Keine Treffer";
      li.style.color = "var(--muted)";
      list.appendChild(li);
      return;
    }
    for (const e of items) {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${escape(e.name)}</span>
        <span class="mg-badge" data-mg="${escape(e.muscleGroup || "")}">${escape(e.muscleGroup || "")}</span>
      `;
      li.onclick = () => {
        addLibraryExercise(plan, day, e);
        m.close();
        rerender();
      };
      list.appendChild(li);
    }
  };

  search.addEventListener("input", renderList);

  customBtn.onclick = () => {
    m.close();
    openCustomExerciseModal(plan, day, rerender);
  };

  const m = openModal({
    title: "Übung hinzufügen",
    body,
    confirmLabel: "Schließen",
    confirmDisabled: false,
    onConfirm: () => {
      // Confirm just closes — selection happens via list click.
    },
  });
  // Hide the confirm button — selection closes the modal.
  m.modal.querySelector("[data-confirm]").style.display = "none";

  refreshFilters();
  renderList();
  search.focus();
}

function openCustomExerciseModal(plan, day, rerender) {
  const body = document.createElement("div");
  body.innerHTML = `
    <p class="modal-hint">Erstelle eine eigene Übung. Sie wird in deine Bibliothek aufgenommen.</p>
    <label class="form-row">
      <span>Name</span>
      <input type="text" id="cex-name" autocomplete="off" />
    </label>
    <label class="form-row">
      <span>Muskelgruppe</span>
      <select id="cex-mg">
        <option value="">— wählen —</option>
      </select>
    </label>
  `;
  const sel = body.querySelector("#cex-mg");
  for (const mg of state.plans.muscleGroups || []) {
    const opt = document.createElement("option");
    opt.value = mg.name;
    opt.textContent = mg.name;
    sel.appendChild(opt);
  }
  const nameInp = body.querySelector("#cex-name");

  const m = openModal({
    title: "Eigene Übung",
    body,
    confirmLabel: "Erstellen",
    confirmDisabled: true,
    onConfirm: () => {
      const name = nameInp.value.trim();
      const mg = sel.value || null;
      if (!name) return false;
      if (!state.plans.exerciseLibrary.find((e) => e.name === name)) {
        state.plans.exerciseLibrary.push({ name, muscleGroup: mg });
      }
      addLibraryExercise(plan, day, { name, muscleGroup: mg });
      rerender();
    },
  });
  const update = () => m.setConfirmEnabled(nameInp.value.trim().length > 0);
  nameInp.addEventListener("input", update);
  nameInp.focus();
}

function addLibraryExercise(plan, day, libEntry) {
  day.exercises.push({
    id: shortId("e_"),
    name: libEntry.name,
    muscleGroup: libEntry.muscleGroup || null,
    sets: null,
    reps: null,
    weight: null,
  });
  plan.updatedAt = new Date().toISOString();
  scheduleSavePlans();
}

function currentPlan() {
  return (state.plans.plans || []).find((p) => p.id === state.activePlanId);
}
