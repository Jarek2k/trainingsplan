// Builder view: create and edit weekly training plans.
// Multiple plans per user, each plan = one training week with up to 7 days.
// Layout: sidebar (plan list) + main (plan editor with day columns).

import {
  state,
  scheduleSavePlans,
  setActivePlanId,
  setCompactView,
  shortId,
} from "../state.js";
import { openModal, openConfirmModal } from "../modal.js";
import { escape, findMg } from "../util.js";

const MAX_DAYS = 7;
const SUGGESTED_DAY_NAMES = [
  "Push", "Pull", "Beine",
  "Push 2", "Pull 2",
  "OK", "UK",
  "Oberkörper", "Unterkörper",
  "Brust", "Rücken", "Schulter", "Arme",
  "Ganzkörper",
];

export function render(root, ctx) {
  root.innerHTML = "";
  renderModeActions(ctx);

  const layout = document.createElement("div");
  layout.className = "builder-layout";

  const sidebar = document.createElement("aside");
  sidebar.className = "builder-sidebar";
  layout.appendChild(sidebar);

  const main = document.createElement("section");
  main.className = "builder-main";
  layout.appendChild(main);

  root.appendChild(layout);

  const rerender = () => render(root, ctx);

  // Resolve which plan is open in the builder. Prefer existing selection,
  // then the active (training) plan, then most-recent.
  const plans = state.plans.plans || [];
  let selectedId = state.builderSelectedPlanId;
  if (!selectedId || !plans.find((p) => p.id === selectedId)) {
    selectedId = state.activePlanId && plans.find((p) => p.id === state.activePlanId)
      ? state.activePlanId
      : plans.length
        ? mostRecent(plans).id
        : null;
    state.builderSelectedPlanId = selectedId;
  }

  renderSidebar(sidebar, rerender);

  const selected = plans.find((p) => p.id === selectedId);
  if (!selected) renderEmptyState(main, rerender);
  else renderEditor(main, selected, rerender);
}

function renderModeActions(ctx) {
  if (!ctx || !ctx.modeActions) return;
  ctx.modeActions.innerHTML = "";

  const manage = document.createElement("button");
  manage.type = "button";
  manage.className = "icon-btn round";
  manage.title = "Verwaltung";
  manage.setAttribute("aria-label", "Muskelgruppen und Übungen verwalten");
  manage.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  `;
  manage.onclick = () => ctx.switchMode("manage");
  ctx.modeActions.appendChild(manage);

  const done = document.createElement("button");
  done.type = "button";
  done.className = "icon-btn round";
  done.title = "Fertig";
  done.setAttribute("aria-label", "Zurück zur Trainingsansicht");
  done.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  `;
  done.onclick = () => ctx.switchMode("view");
  ctx.modeActions.appendChild(done);
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

  const cmpBtn = document.createElement("button");
  cmpBtn.className = "btn ghost";
  cmpBtn.textContent = "Vergleichen";
  cmpBtn.disabled = plans.length < 2;
  cmpBtn.title = plans.length < 2 ? "Mindestens 2 Pläne nötig" : "Pläne vergleichen";
  cmpBtn.onclick = () => openCompareModal();
  head.appendChild(cmpBtn);

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
  const isSelected = plan.id === state.builderSelectedPlanId;
  const isActive = plan.id === state.activePlanId;
  li.className = "builder-plan-row" + (isSelected ? " active" : "");

  const label = document.createElement("button");
  label.className = "builder-plan-label";
  label.innerHTML = `
    ${isActive ? `<span class="builder-plan-star" title="Aktiver Trainingsplan" aria-label="Aktiver Trainingsplan">★</span>` : ""}
    <span class="builder-plan-label-text">${escape(plan.name)}</span>
  `;
  label.onclick = () => {
    state.builderSelectedPlanId = plan.id;
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

  if (plan.id !== state.activePlanId) {
    pop.appendChild(item("Als aktiven Plan setzen", () => {
      setActivePlanId(plan.id);
      rerender();
    }));
  }
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

  const volumeHost = document.createElement("div");
  volumeHost.className = "builder-volume-host";
  const refreshVolume = () => {
    volumeHost.innerHTML = "";
    const bar = renderVolumeBar(plan);
    if (bar) volumeHost.appendChild(bar);
  };
  refreshVolume();
  root.appendChild(volumeHost);

  const board = document.createElement("div");
  board.className = "builder-board" + (state.compactView ? " compact" : "");

  for (const day of plan.days) {
    board.appendChild(renderDayColumn(plan, day, rerender, refreshVolume));
  }

  if (plan.days.length < MAX_DAYS) {
    board.appendChild(renderAddDayColumn(plan, rerender));
  }

  root.appendChild(board);
}

function renderVolumeBar(plan) {
  // Sum sets per muscle group across all days. Exercises without sets count as 0.
  const totals = new Map(); // mgId -> sets
  let total = 0;
  for (const day of plan.days) {
    for (const ex of day.exercises) {
      const n = Number.isFinite(ex.sets) ? ex.sets : 0;
      if (n <= 0) continue;
      const key = ex.muscleGroupId || "__none";
      totals.set(key, (totals.get(key) || 0) + n);
      total += n;
    }
  }

  const planDays = plan.days.length || 1;
  const perWeek = clampPerWeek(plan.trainingsPerWeek, planDays);
  const factor = perWeek / planDays;

  const entries = [...totals.entries()]
    .map(([mgId, sets]) => ({ mg: findMg(state.plans, mgId), sets }))
    .sort((a, b) => b.sets - a.sets);

  const wrap = document.createElement("div");
  wrap.className = "builder-volume";

  const label = document.createElement("span");
  label.className = "builder-volume-label";
  label.textContent = "Volumen";
  wrap.appendChild(label);

  const cycle = document.createElement("label");
  cycle.className = "builder-volume-cycle";
  cycle.title = "Wie oft du diesen Plan pro Kalenderwoche trainierst";
  const cycleInput = document.createElement("input");
  cycleInput.type = "number";
  cycleInput.min = "1";
  cycleInput.max = String(Math.max(planDays, 1));
  cycleInput.inputMode = "numeric";
  cycleInput.value = String(perWeek);
  cycleInput.addEventListener("change", () => {
    const next = clampPerWeek(parseInt(cycleInput.value, 10), planDays);
    cycleInput.value = String(next);
    if (next !== plan.trainingsPerWeek) {
      plan.trainingsPerWeek = next;
      plan.updatedAt = new Date().toISOString();
      scheduleSavePlans();
    }
    const host = wrap.parentElement;
    if (host) {
      host.innerHTML = "";
      const fresh = renderVolumeBar(plan);
      if (fresh) host.appendChild(fresh);
    }
  });
  const cycleUnit = document.createElement("span");
  cycleUnit.textContent = "× Training";
  cycle.append(cycleInput, cycleUnit);
  wrap.appendChild(cycle);

  if (total === 0) {
    const hint = document.createElement("span");
    hint.className = "builder-volume-hint";
    hint.textContent = "Noch keine Sätze geplant";
    wrap.appendChild(hint);
    return wrap;
  }

  const list = document.createElement("div");
  list.className = "builder-volume-list";
  for (const { mg, sets } of entries) {
    const pill = document.createElement("span");
    pill.className = "mg-pill builder-volume-pill";
    if (mg) pill.dataset.mgColor = mg.colorKey;
    const shown = formatVolume(sets * factor);
    const name = mg ? mg.name : "Ohne Muskelgruppe";
    pill.title = buildVolumeTooltip(name, sets, perWeek, planDays, shown);
    pill.innerHTML = `
      <span class="builder-volume-name">${escape(name)}</span>
      <span class="builder-volume-sets">${shown}</span>
    `;
    list.appendChild(pill);
  }
  wrap.appendChild(list);
  return wrap;
}

function buildVolumeTooltip(name, sets, perWeek, planDays, shown) {
  if (perWeek === planDays) {
    return `${name}: ${sets} Sätze pro Woche\n(alle ${planDays} Trainingstage ergeben eine Kalenderwoche)`;
  }
  return `${name}: ${sets} Sätze pro Trainingszyklus\nDu trainierst ${perWeek}× von ${planDays} Tagen pro Kalenderwoche\n${sets} × ${perWeek}/${planDays} = ${shown} im Schnitt pro Woche`;
}

function clampPerWeek(v, planDays) {
  const max = Math.max(planDays || 1, 1);
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1) return Math.min(max, planDays || 1);
  if (n > max) return max;
  return n;
}

function formatVolume(v) {
  if (!Number.isFinite(v)) return "0";
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace(".", ",");
}

function renderDayColumn(plan, day, rerender, refreshVolume) {
  const col = document.createElement("div");
  col.className = "builder-day";
  col.dataset.dayId = day.id;

  col.addEventListener("dragover", (e) => {
    if (state.builderDragging?.type !== "day") return;
    if (state.builderDragging.dayId === day.id) return;
    e.preventDefault();
    const rect = col.getBoundingClientRect();
    const before = e.clientX < rect.left + rect.width / 2;
    document.querySelectorAll(".builder-day.drop-left, .builder-day.drop-right").forEach((el) => {
      if (el !== col) el.classList.remove("drop-left", "drop-right");
    });
    col.classList.toggle("drop-left", before);
    col.classList.toggle("drop-right", !before);
  });
  col.addEventListener("dragleave", (e) => {
    if (state.builderDragging?.type !== "day") return;
    if (col.contains(e.relatedTarget)) return;
    col.classList.remove("drop-left", "drop-right");
  });
  col.addEventListener("drop", (e) => {
    if (state.builderDragging?.type !== "day") return;
    e.preventDefault();
    const before = col.classList.contains("drop-left");
    col.classList.remove("drop-left", "drop-right");
    handleDropOnDay(plan, day, before, rerender);
  });

  const head = document.createElement("div");
  head.className = "builder-day-head";

  const handle = document.createElement("span");
  handle.className = "drag-handle day-drag-handle";
  handle.setAttribute("aria-label", "Tag verschieben");
  handle.title = "Ziehen zum Verschieben";
  handle.textContent = "⋮⋮";
  handle.draggable = true;
  handle.addEventListener("dragstart", (e) => {
    state.builderDragging = { type: "day", dayId: day.id };
    col.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", day.id);
      const r = col.getBoundingClientRect();
      e.dataTransfer.setDragImage(col, e.clientX - r.left, e.clientY - r.top);
    } catch {
      // Some browsers throw on unusual MIME / setDragImage — non-fatal.
    }
    startDragAutoScroll();
  });
  handle.addEventListener("dragend", () => {
    state.builderDragging = null;
    stopDragAutoScroll();
    document.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
    document.querySelectorAll(".drop-left, .drop-right").forEach((el) => {
      el.classList.remove("drop-left", "drop-right");
    });
  });
  head.appendChild(handle);

  const name = document.createElement("button");
  name.className = "builder-day-name";
  name.textContent = day.name;
  name.title = "Tag umbenennen";
  name.onclick = () => openRenameDayModal(day, rerender);
  head.appendChild(name);

  const dup = document.createElement("button");
  dup.className = "icon-btn";
  dup.title = "Tag duplizieren";
  dup.setAttribute("aria-label", "Tag duplizieren");
  dup.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>`;
  if (plan.days.length >= MAX_DAYS) {
    dup.disabled = true;
    dup.title = `Maximal ${MAX_DAYS} Trainingstage`;
  }
  dup.onclick = () => duplicateDay(plan, day, rerender);
  head.appendChild(dup);

  const del = document.createElement("button");
  del.className = "icon-btn";
  del.title = "Tag entfernen";
  del.setAttribute("aria-label", "Tag entfernen");
  del.textContent = "✕";
  del.onclick = () => {
    const n = day.exercises.length;
    openConfirmModal({
      title: "Trainingstag entfernen",
      message:
        n === 0
          ? `Trainingstag „${day.name}" entfernen?`
          : `Trainingstag „${day.name}" mit ${n} Übung${n === 1 ? "" : "en"} entfernen?`,
      confirmLabel: "Entfernen",
      onConfirm: () => {
        plan.days = plan.days.filter((d) => d.id !== day.id);
        plan.updatedAt = new Date().toISOString();
        scheduleSavePlans();
        rerender();
      },
    });
  };
  head.appendChild(del);
  col.appendChild(head);

  const body = document.createElement("div");
  body.className = "builder-day-body";
  body.dataset.dayId = day.id;

  for (const ex of day.exercises) {
    body.appendChild(renderExerciseBox(plan, day, ex, rerender, refreshVolume));
  }

  // Drop-zone "tail" so users can drop at the very end of the column.
  const tail = document.createElement("div");
  tail.className = "builder-drop-tail";
  tail.dataset.dayId = day.id;
  tail.addEventListener("dragover", (e) => {
    if (state.builderDragging?.type !== "exercise") return;
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

function renderExerciseBox(plan, day, ex, rerender, refreshVolume) {
  const mg = findMg(state.plans, ex.muscleGroupId);
  const box = document.createElement("article");
  box.className = "exercise-box";
  if (mg) box.dataset.mgColor = mg.colorKey;
  box.dataset.exerciseId = ex.id;
  box.dataset.dayId = day.id;
  // Draggable is on the handle only — see below — so click-drag inside inputs
  // doesn't hijack text selection.

  box.addEventListener("dragenter", () => {
    if (state.builderDragging?.type !== "exercise") return;
    // Claim the indicator: clear any other box's drop classes so only one shows.
    document.querySelectorAll(".drop-before, .drop-after").forEach((el) => {
      if (el !== box) el.classList.remove("drop-before", "drop-after");
    });
  });
  box.addEventListener("dragover", (e) => {
    if (state.builderDragging?.type !== "exercise") return;
    e.preventDefault();
    const rect = box.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    box.classList.toggle("drop-before", before);
    box.classList.toggle("drop-after", !before);
  });
  box.addEventListener("drop", (e) => {
    if (state.builderDragging?.type !== "exercise") return;
    e.preventDefault();
    const before = box.classList.contains("drop-before");
    box.classList.remove("drop-before", "drop-after");
    handleDropOnBox(plan, day, ex, before, rerender);
  });

  const head = document.createElement("div");
  head.className = "exercise-box-head";
  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.setAttribute("aria-label", "Übung verschieben");
  handle.title = "Ziehen zum Verschieben";
  handle.textContent = "⋮⋮";
  handle.draggable = true;
  handle.addEventListener("dragstart", (e) => {
    state.builderDragging = { type: "exercise", fromDayId: day.id, exerciseId: ex.id };
    box.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", ex.id);
      // Use the whole box as the drag-image so the ghost matches what the
      // user is moving, not just the small handle glyph.
      const r = box.getBoundingClientRect();
      e.dataTransfer.setDragImage(box, e.clientX - r.left, e.clientY - r.top);
    } catch {
      // Some browsers throw on unusual MIME / setDragImage — non-fatal.
    }
    startDragAutoScroll();
  });
  handle.addEventListener("dragend", () => {
    state.builderDragging = null;
    stopDragAutoScroll();
    document.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
    document.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
    document.querySelectorAll(".drop-before, .drop-after").forEach((el) => {
      el.classList.remove("drop-before", "drop-after");
    });
  });
  head.appendChild(handle);

  const titles = document.createElement("button");
  titles.type = "button";
  titles.className = "exercise-box-titles";
  titles.title = "Übung ersetzen";
  titles.setAttribute("aria-label", `${ex.name} ersetzen`);
  titles.innerHTML = `
    <div class="exercise-box-name">${escape(ex.name)}</div>
    <div class="exercise-box-mg">${escape(mg ? mg.name : "—")}</div>
  `;
  titles.onclick = () => openReplaceExerciseModal(plan, day, ex, rerender);
  head.appendChild(titles);

  const remove = document.createElement("button");
  remove.className = "icon-btn";
  remove.title = "Übung entfernen";
  remove.setAttribute("aria-label", "Übung entfernen");
  remove.textContent = "✕";
  remove.onclick = () => {
    openConfirmModal({
      title: "Übung entfernen",
      message: `„${ex.name}" aus „${day.name}" entfernen?`,
      confirmLabel: "Entfernen",
      onConfirm: () => {
        day.exercises = day.exercises.filter((e) => e.id !== ex.id);
        plan.updatedAt = new Date().toISOString();
        scheduleSavePlans();
        rerender();
      },
    });
  };
  head.appendChild(remove);
  box.appendChild(head);

  const inputs = document.createElement("div");
  inputs.className = "exercise-box-inputs";
  inputs.appendChild(field("Sätze", "sets", ex, plan, "numeric", refreshVolume));
  inputs.appendChild(field("Wdh.", "reps", ex, plan, "decimal"));
  inputs.appendChild(field("kg", "weight", ex, plan, "decimal"));
  box.appendChild(inputs);

  return box;
}

function field(label, key, ex, plan, mode, onChange) {
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
    if (onChange) onChange();
  });
  // Auto-select existing value on focus, so a click immediately overwrites.
  // Avoid stealing the user's manual selection if they click-drag within
  // the field by deferring to next tick and only selecting when nothing
  // is selected yet.
  inp.addEventListener("focus", () => {
    setTimeout(() => {
      if (document.activeElement !== inp) return;
      if (inp.selectionStart !== inp.selectionEnd) return;
      inp.select();
    }, 0);
  });
  wrap.append(lab, inp);
  return wrap;
}

// --- Drag-and-drop handlers -------------------------------------------------

function handleDropOnDay(plan, targetDay, before, rerender) {
  const drag = state.builderDragging;
  if (!drag || drag.type !== "day") return;
  if (drag.dayId === targetDay.id) return;
  const fromIdx = plan.days.findIndex((d) => d.id === drag.dayId);
  if (fromIdx < 0) return;
  const [moved] = plan.days.splice(fromIdx, 1);
  let toIdx = plan.days.findIndex((d) => d.id === targetDay.id);
  if (toIdx < 0) toIdx = plan.days.length;
  if (!before) toIdx += 1;
  plan.days.splice(toIdx, 0, moved);
  plan.updatedAt = new Date().toISOString();
  scheduleSavePlans();
  rerender();
}

function duplicateDay(plan, day, rerender) {
  if (plan.days.length >= MAX_DAYS) return;
  const idx = plan.days.findIndex((d) => d.id === day.id);
  if (idx < 0) return;
  const copy = {
    id: shortId("d_"),
    name: day.name,
    exercises: day.exercises.map((e) => ({ ...e, id: shortId("e_") })),
  };
  plan.days.splice(idx + 1, 0, copy);
  plan.updatedAt = new Date().toISOString();
  scheduleSavePlans();
  rerender();
}

function handleDropOnBox(plan, targetDay, targetEx, before, rerender) {
  const drag = state.builderDragging;
  if (!drag || drag.type !== "exercise") return;
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
  if (!drag || drag.type !== "exercise") return;
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
  state.builderSelectedPlanId = plan.id;
  // First plan is auto-active so the viewer has something to show.
  if (!state.activePlanId) setActivePlanId(plan.id);
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
  state.builderSelectedPlanId = copy.id;
  scheduleSavePlans();
  rerender();
}

function deletePlan(plan, rerender) {
  openConfirmModal({
    title: "Plan löschen",
    message: `Plan „${plan.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`,
    confirmLabel: "Löschen",
    onConfirm: () => {
      state.plans.plans = state.plans.plans.filter((p) => p.id !== plan.id);
      if (state.builderSelectedPlanId === plan.id) state.builderSelectedPlanId = null;
      if (state.activePlanId === plan.id) setActivePlanId(null);
      scheduleSavePlans();
      rerender();
    },
  });
}

function renamePlanPrompt(plan, rerender) {
  const body = document.createElement("div");
  body.innerHTML = `<input type="text" id="plan-rename" autocomplete="off" />`;
  const inp = body.querySelector("#plan-rename");
  inp.value = plan.name;
  const m = openModal({
    title: "Plan umbenennen",
    body,
    confirmLabel: "Speichern",
    confirmDisabled: false,
    onConfirm: () => {
      const v = inp.value.trim();
      if (!v) return false;
      if (v !== plan.name) {
        plan.name = v;
        plan.updatedAt = new Date().toISOString();
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

// --- Modals -----------------------------------------------------------------

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

function openExercisePickerModal({ title, currentName, initialFilter, onPick, onPickCustom }) {
  let activeFilter = initialFilter || null; // muscleGroup id or null
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
      pill.className = "pill mg-pill" + (activeFilter === mg.id ? " active" : "");
      pill.dataset.mgColor = mg.colorKey;
      pill.textContent = mg.name;
      pill.onclick = () => {
        activeFilter = activeFilter === mg.id ? null : mg.id;
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
      if (activeFilter && e.muscleGroupId !== activeFilter) return false;
      if (!q) return true;
      const mg = findMg(state.plans, e.muscleGroupId);
      return (
        e.name.toLowerCase().includes(q) ||
        (mg ? mg.name.toLowerCase().includes(q) : false)
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
      const mg = findMg(state.plans, e.muscleGroupId);
      const li = document.createElement("li");
      if (currentName && e.name === currentName) li.className = "current";
      li.innerHTML = `
        <span>${escape(e.name)}</span>
        <span class="mg-badge"${mg ? ` data-mg-color="${escape(mg.colorKey)}"` : ""}>${escape(mg ? mg.name : "")}</span>
      `;
      li.onclick = () => {
        m.close();
        onPick(e);
      };
      list.appendChild(li);
    }
  };

  search.addEventListener("input", renderList);

  customBtn.onclick = () => {
    m.close();
    onPickCustom();
  };

  const m = openModal({
    title,
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

function openAddExerciseModal(plan, day, rerender) {
  openExercisePickerModal({
    title: "Übung hinzufügen",
    onPick: (entry) => {
      addLibraryExercise(plan, day, entry);
      rerender();
    },
    onPickCustom: () => openCustomExerciseModal(plan, day, rerender),
  });
}

function openReplaceExerciseModal(plan, day, ex, rerender) {
  openExercisePickerModal({
    title: "Übung ersetzen",
    currentName: ex.name,
    initialFilter: ex.muscleGroupId || null,
    onPick: (entry) => {
      ex.name = entry.name;
      ex.muscleGroupId = entry.muscleGroupId || null;
      plan.updatedAt = new Date().toISOString();
      scheduleSavePlans();
      rerender();
    },
    onPickCustom: () =>
      openCustomExerciseModal(plan, day, rerender, {
        replaceExercise: ex,
      }),
  });
}

function openCustomExerciseModal(plan, day, rerender, opts = {}) {
  const { replaceExercise } = opts;
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
    opt.value = mg.id;
    opt.textContent = mg.name;
    sel.appendChild(opt);
  }
  const nameInp = body.querySelector("#cex-name");

  const m = openModal({
    title: replaceExercise ? "Eigene Übung als Ersatz" : "Eigene Übung",
    body,
    confirmLabel: replaceExercise ? "Ersetzen" : "Erstellen",
    confirmDisabled: true,
    onConfirm: () => {
      const name = nameInp.value.trim();
      const mgId = sel.value || null;
      if (!name) return false;
      if (!state.plans.exerciseLibrary.find((e) => e.name === name)) {
        state.plans.exerciseLibrary.push({
          id: shortId("le_"),
          name,
          muscleGroupId: mgId,
        });
      }
      if (replaceExercise) {
        replaceExercise.name = name;
        replaceExercise.muscleGroupId = mgId;
        plan.updatedAt = new Date().toISOString();
        scheduleSavePlans();
      } else {
        addLibraryExercise(plan, day, { name, muscleGroupId: mgId });
      }
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
    muscleGroupId: libEntry.muscleGroupId || null,
    sets: null,
    reps: null,
    weight: null,
  });
  plan.updatedAt = new Date().toISOString();
  scheduleSavePlans();
}

function currentPlan() {
  return (state.plans.plans || []).find(
    (p) => p.id === state.builderSelectedPlanId,
  );
}

// --- Plan compare modal -----------------------------------------------------

function openCompareModal() {
  const plans = state.plans.plans || [];
  if (plans.length < 2) return;

  const sel = new Map(
    plans.map((p) => [
      p.id,
      {
        selected: false,
        perWeek: clampPerWeek(p.trainingsPerWeek, p.days.length || 1),
      },
    ]),
  );

  const body = document.createElement("div");
  body.className = "compare-body";

  const hint = document.createElement("p");
  hint.className = "modal-hint";
  hint.textContent = "Pläne wählen (mind. 2) und Trainings pro Woche festlegen.";
  body.appendChild(hint);

  const picker = document.createElement("div");
  picker.className = "compare-picker";
  for (const p of plans) {
    picker.appendChild(buildCompareRow(p, sel, () => refresh()));
  }
  body.appendChild(picker);

  const result = document.createElement("div");
  result.className = "compare-result";
  body.appendChild(result);

  const refresh = () => {
    const chosen = plans.filter((p) => sel.get(p.id).selected);
    result.innerHTML = "";
    if (chosen.length < 2) {
      const empty = document.createElement("p");
      empty.className = "compare-empty";
      empty.textContent = "Wähle mindestens 2 Pläne zum Vergleichen.";
      result.appendChild(empty);
      return;
    }
    result.appendChild(buildCompareTable(chosen, sel));
  };
  refresh();

  const m = openModal({
    title: "Pläne vergleichen",
    body,
    confirmLabel: "Schließen",
    confirmDisabled: false,
    onConfirm: () => {},
  });
  m.modal.classList.add("compare-modal");
  const cancel = m.modal.querySelector("[data-cancel]");
  if (cancel) cancel.style.display = "none";
}

function buildCompareRow(plan, sel, onChange) {
  const row = document.createElement("label");
  row.className = "compare-row";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.addEventListener("change", () => {
    sel.get(plan.id).selected = cb.checked;
    onChange();
  });
  row.appendChild(cb);

  const name = document.createElement("span");
  name.className = "compare-row-name";
  name.textContent = plan.name;
  row.appendChild(name);

  const planDays = plan.days.length || 1;
  const perWeek = document.createElement("input");
  perWeek.type = "number";
  perWeek.min = "1";
  perWeek.max = String(planDays);
  perWeek.inputMode = "numeric";
  perWeek.value = String(sel.get(plan.id).perWeek);
  perWeek.className = "compare-row-perweek";
  perWeek.addEventListener("change", () => {
    const v = clampPerWeek(parseInt(perWeek.value, 10), planDays);
    perWeek.value = String(v);
    sel.get(plan.id).perWeek = v;
    onChange();
  });
  // Clicking the number input shouldn't toggle the checkbox via label.
  perWeek.addEventListener("click", (e) => e.preventDefault());
  row.appendChild(perWeek);

  const unit = document.createElement("span");
  unit.className = "compare-row-unit";
  unit.textContent = `×/Woche · ${planDays} Tag${planDays === 1 ? "" : "e"}`;
  row.appendChild(unit);

  return row;
}

function buildCompareTable(chosenPlans, sel) {
  const perPlan = chosenPlans.map((plan) => ({
    plan,
    perWeek: sel.get(plan.id).perWeek,
    volumes: computeWeeklyMgVolume(plan, sel.get(plan.id).perWeek),
  }));

  const mgKeys = new Map();
  for (const { volumes } of perPlan) {
    for (const k of volumes.keys()) {
      if (!mgKeys.has(k)) mgKeys.set(k, true);
    }
  }

  const rows = [...mgKeys.keys()].map((key) => {
    const values = perPlan.map(({ volumes }) =>
      volumes.has(key) ? volumes.get(key) : null,
    );
    const numeric = values.filter((v) => v != null);
    const max = numeric.length ? Math.max(...numeric) : 0;
    return { key, values, max };
  });
  rows.sort((a, b) => b.max - a.max);

  const table = document.createElement("table");
  table.className = "compare-table";

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  const thMg = document.createElement("th");
  thMg.textContent = "Muskelgruppe";
  trh.appendChild(thMg);
  for (const { plan, perWeek } of perPlan) {
    const th = document.createElement("th");
    th.innerHTML = `
      <div class="compare-th-inner">
        <span class="compare-th-name">${escape(plan.name)}</span>
        <span class="compare-th-cycle">${perWeek}×/Woche</span>
      </div>
    `;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    if (row.key === "__none") {
      tdLabel.textContent = "Ohne Muskelgruppe";
      tdLabel.classList.add("compare-cell-none");
    } else {
      const mg = findMg(state.plans, row.key);
      if (mg) {
        const pill = document.createElement("span");
        pill.className = "mg-pill";
        pill.dataset.mgColor = mg.colorKey;
        pill.textContent = mg.name;
        tdLabel.appendChild(pill);
      } else {
        tdLabel.textContent = row.key;
      }
    }
    tr.appendChild(tdLabel);

    for (let i = 0; i < row.values.length; i++) {
      const td = document.createElement("td");
      const v = row.values[i];
      if (v == null) {
        td.textContent = "—";
        td.classList.add("compare-cell-missing");
      } else {
        td.textContent = formatVolume(v);
        if (row.values.length === 2) {
          const other = row.values[1 - i];
          if (other == null) td.classList.add("compare-cell-only");
          else if (v > other) td.classList.add("compare-cell-higher");
          else if (v < other) td.classList.add("compare-cell-lower");
        } else if (v === row.max && row.max > 0) {
          td.classList.add("compare-cell-higher");
        }
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  const tfoot = document.createElement("tfoot");
  const trf = document.createElement("tr");
  const tdSum = document.createElement("td");
  tdSum.textContent = "Summe / Woche";
  trf.appendChild(tdSum);
  const sums = perPlan.map(({ volumes }) => {
    let s = 0;
    for (const v of volumes.values()) s += v;
    return s;
  });
  const maxSum = Math.max(...sums);
  for (let i = 0; i < sums.length; i++) {
    const td = document.createElement("td");
    td.textContent = formatVolume(sums[i]);
    if (sums.length === 2) {
      const other = sums[1 - i];
      if (sums[i] > other) td.classList.add("compare-cell-higher");
      else if (sums[i] < other) td.classList.add("compare-cell-lower");
    } else if (sums[i] === maxSum && maxSum > 0) {
      td.classList.add("compare-cell-higher");
    }
    trf.appendChild(td);
  }
  tfoot.appendChild(trf);
  table.appendChild(tfoot);

  return table;
}

function computeWeeklyMgVolume(plan, perWeek) {
  const planDays = plan.days.length || 1;
  const factor = clampPerWeek(perWeek, planDays) / planDays;
  const out = new Map();
  for (const day of plan.days) {
    for (const ex of day.exercises) {
      const n = Number.isFinite(ex.sets) ? ex.sets : 0;
      if (n <= 0) continue;
      const key = ex.muscleGroupId || "__none";
      out.set(key, (out.get(key) || 0) + n);
    }
  }
  for (const [k, v] of out) out.set(k, v * factor);
  return out;
}

// --- Drag auto-scroll -------------------------------------------------------
// Native HTML5 DnD only auto-scrolls the viewport edge, not internally scrollable
// containers. Each day column scrolls independently, and the horizontal board
// also scrolls, so we drive a small RAF loop while dragging that nudges
// whichever scrollable element the pointer is hovering near the edge of.

const AUTOSCROLL_EDGE = 64; // px from edge to start scrolling
const AUTOSCROLL_MAX = 20;  // max px per frame at the very edge

const dragPointer = { x: 0, y: 0 };
let dragScrollRaf = null;

document.addEventListener("dragover", (e) => {
  if (!state.builderDragging) return;
  dragPointer.x = e.clientX;
  dragPointer.y = e.clientY;
});

function startDragAutoScroll() {
  if (dragScrollRaf != null) return;
  const tick = () => {
    stepDragAutoScroll();
    dragScrollRaf = requestAnimationFrame(tick);
  };
  dragScrollRaf = requestAnimationFrame(tick);
}

function stopDragAutoScroll() {
  if (dragScrollRaf != null) cancelAnimationFrame(dragScrollRaf);
  dragScrollRaf = null;
}

function stepDragAutoScroll() {
  const { x, y } = dragPointer;
  if (!x && !y) return;
  // Walk the elements under the pointer and scroll the first scrollable one
  // whose edge we're near. This handles both .builder-day-body (vertical) and
  // .builder-board (horizontal) naturally.
  const stack = document.elementsFromPoint(x, y);
  for (const el of stack) {
    if (!(el instanceof Element)) continue;
    if (scrollIfNeeded(el, x, y)) return;
  }
}

function scrollIfNeeded(el, x, y) {
  const cs = getComputedStyle(el);
  const canY =
    (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
    el.scrollHeight > el.clientHeight;
  const canX =
    (cs.overflowX === "auto" || cs.overflowX === "scroll") &&
    el.scrollWidth > el.clientWidth;
  if (!canY && !canX) return false;
  const r = el.getBoundingClientRect();
  if (canY) {
    const top = y - r.top;
    const bot = r.bottom - y;
    if (top < AUTOSCROLL_EDGE && el.scrollTop > 0) {
      el.scrollTop -= speedFor(top);
      return true;
    }
    if (bot < AUTOSCROLL_EDGE && el.scrollTop + el.clientHeight < el.scrollHeight) {
      el.scrollTop += speedFor(bot);
      return true;
    }
  }
  if (canX) {
    const left = x - r.left;
    const right = r.right - x;
    if (left < AUTOSCROLL_EDGE && el.scrollLeft > 0) {
      el.scrollLeft -= speedFor(left);
      return true;
    }
    if (right < AUTOSCROLL_EDGE && el.scrollLeft + el.clientWidth < el.scrollWidth) {
      el.scrollLeft += speedFor(right);
      return true;
    }
  }
  return false;
}

function speedFor(dist) {
  const t = Math.max(0, 1 - dist / AUTOSCROLL_EDGE);
  // Ease the ramp so the very edge scrolls faster but mid-zone is gentle.
  return Math.ceil(t * t * AUTOSCROLL_MAX) || 1;
}
