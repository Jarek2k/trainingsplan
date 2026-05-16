// Builder view: create and edit weekly training plans.
// Multiple plans per user, each plan = one training week with up to 7 days.
// Layout: sidebar (plan list) + main (plan editor with day columns).

import {
  state,
  scheduleSavePlans,
  savePlans,
  setActivePlanId,
  setCompactView,
  shortId,
  loadSharedPlans,
} from "../state.js";
import { openModal, openConfirmModal } from "../modal.js";
import { escape, findMg } from "../util.js";
import { PALETTE_KEYS, DEFAULT_COLOR_KEY } from "../palette.js";

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

  // Shared-preview takes priority over own-plan selection.
  if (state.builderSelectedShared) {
    const shared = state.sharedPlans.find(
      (s) =>
        s.plan.id === state.builderSelectedShared.planId &&
        s.owner.email === state.builderSelectedShared.ownerEmail,
    );
    if (shared) {
      renderSharedPreview(main, shared, rerender);
      return;
    }
    // Stale selection — drop and fall through.
    state.builderSelectedShared = null;
  }

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

  // Shared-plans section: only render when at least one shared plan is
  // available from another user. The owner's own plans never appear here.
  const shared = state.sharedPlans || [];
  if (shared.length > 0) {
    const sharedTitle = document.createElement("div");
    sharedTitle.className = "builder-sidebar-title";
    sharedTitle.textContent = "Geteilte Pläne";
    root.appendChild(sharedTitle);

    const sharedList = document.createElement("ul");
    sharedList.className = "builder-plan-list builder-shared-list";
    for (const s of shared) {
      sharedList.appendChild(renderSharedRow(s, rerender));
    }
    root.appendChild(sharedList);
  }
}

function renderSharedRow(shared, rerender) {
  const li = document.createElement("li");
  const sel = state.builderSelectedShared;
  const isSelected =
    sel && sel.planId === shared.plan.id && sel.ownerEmail === shared.owner.email;
  li.className = "builder-plan-row builder-shared-row" + (isSelected ? " active" : "");

  const label = document.createElement("button");
  label.className = "builder-plan-label";
  const subtitle = shared.mine
    ? "dein Plan"
    : `von ${ownerDisplay(shared.owner.email)}`;
  label.innerHTML = `
    <span class="builder-plan-label-text">${escape(shared.plan.name)}</span>
    <span class="builder-shared-owner">${escape(subtitle)}</span>
  `;
  label.onclick = () => {
    state.builderSelectedShared = {
      planId: shared.plan.id,
      ownerEmail: shared.owner.email,
    };
    rerender();
  };
  li.appendChild(label);
  return li;
}

function ownerDisplay(email) {
  if (!email) return "—";
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
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
    state.builderSelectedShared = null;
    rerender();
  };
  li.appendChild(label);

  // Eye toggle — always visible, single click changes share-state. Filled
  // eye = sichtbar, durchgestrichenes Auge = privat.
  const eye = document.createElement("button");
  eye.type = "button";
  eye.className = "builder-plan-eye" + (plan.shared ? " active" : "");
  eye.setAttribute("aria-pressed", plan.shared ? "true" : "false");
  eye.title = plan.shared ? "Sichtbar für Freunde — Klick: privat" : "Privat — Klick: sichtbar machen";
  eye.setAttribute("aria-label", eye.title);
  eye.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  `;
  eye.onclick = (e) => {
    e.stopPropagation();
    togglePlanShared(plan, rerender);
  };
  li.appendChild(eye);

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
  pop.appendChild(item("Exportieren", () => openExportModal(plan)));
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

  // Plan-header + volume bar stick together at the top while the day list
  // scrolls underneath (see CSS .builder-sticky-top on mobile).
  const stickyTop = document.createElement("div");
  stickyTop.className = "builder-sticky-top";
  stickyTop.appendChild(header);

  const volumeHost = document.createElement("div");
  volumeHost.className = "builder-volume-host";
  const refreshVolume = () => {
    volumeHost.innerHTML = "";
    const bar = renderVolumeBar(plan);
    if (bar) volumeHost.appendChild(bar);
  };
  refreshVolume();
  stickyTop.appendChild(volumeHost);
  root.appendChild(stickyTop);

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
  if (state.builderExpanded.has(ex.id)) box.classList.add("expanded");
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
  titles.innerHTML = `
    <div class="exercise-box-name">${escape(ex.name)}</div>
    <div class="exercise-box-mg">${escape(mg ? mg.name : "—")}</div>
  `;
  titles.onclick = () => {
    // Mobile: tap title toggles expand/collapse. Desktop: opens replace modal.
    if (window.matchMedia("(max-width: 768px)").matches) {
      if (state.builderExpanded.has(ex.id)) state.builderExpanded.delete(ex.id);
      else state.builderExpanded.add(ex.id);
      rerender();
      return;
    }
    openReplaceExerciseModal(plan, day, ex, rerender);
  };
  titles.title = window.matchMedia("(max-width: 768px)").matches
    ? "Ein-/Ausklappen"
    : "Übung ersetzen";
  titles.setAttribute(
    "aria-label",
    window.matchMedia("(max-width: 768px)").matches
      ? `${ex.name} ein- oder ausklappen`
      : `${ex.name} ersetzen`,
  );
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
  savePlans();
  rerender();
}

async function togglePlanShared(plan, rerender) {
  plan.shared = !plan.shared;
  // Note: we deliberately don't bump plan.updatedAt — sharing is a meta flag,
  // not a content change. Otherwise the plan would jump to the top of the
  // sidebar list (which sorts by updatedAt).
  await savePlans();
  await loadSharedPlans();
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
      savePlans();
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
  let activeTab = "blank"; // "blank" | "import"
  let parsedImport = null;

  const body = document.createElement("div");
  body.className = "create-plan-body";
  body.innerHTML = `
    <div class="export-tabs create-plan-tabs">
      <button type="button" class="export-tab active" data-tab="blank">Leer erstellen</button>
      <button type="button" class="export-tab" data-tab="import">Importieren</button>
    </div>
    <div class="create-plan-panel" data-panel="blank">
      <p class="modal-hint">Wähle einen Namen für deinen neuen Trainingsplan.</p>
      <input type="text" class="create-plan-name" placeholder="z.B. Push/Pull/Beine" autocomplete="off" />
    </div>
    <div class="create-plan-panel import-body" data-panel="import" hidden>
      <p class="modal-hint">JSON eines exportierten Plans einfügen oder Datei wählen. Muskelgruppen werden über den Namen abgeglichen; unbekannte werden neu angelegt. Die Bibliothek bleibt unverändert.</p>
      <input type="file" accept="application/json,.json" class="import-file" />
      <textarea class="import-json" placeholder='{"kind":"trainingsplan/plan/v1", …}' rows="10" spellcheck="false"></textarea>
      <p class="import-error" hidden></p>
    </div>
  `;

  const nameInp = body.querySelector(".create-plan-name");
  const fileInp = body.querySelector(".import-file");
  const textarea = body.querySelector(".import-json");
  const errEl = body.querySelector(".import-error");
  const panels = body.querySelectorAll(".create-plan-panel");
  const tabBtns = body.querySelectorAll(".create-plan-tabs [data-tab]");

  const updateConfirm = () => {
    if (activeTab === "blank") {
      m.setConfirmEnabled(nameInp.value.trim().length > 0);
    } else {
      m.setConfirmEnabled(!!parsedImport);
    }
  };

  const setActiveTab = (tab) => {
    activeTab = tab;
    for (const btn of tabBtns) btn.classList.toggle("active", btn.dataset.tab === tab);
    for (const p of panels) p.hidden = p.dataset.panel !== tab;
    const confirmBtn = m.modal.querySelector("[data-confirm]");
    confirmBtn.textContent = tab === "blank" ? "Erstellen" : "Importieren";
    updateConfirm();
    setTimeout(() => {
      if (tab === "blank") nameInp.focus();
      else textarea.focus();
    }, 0);
  };

  nameInp.addEventListener("input", updateConfirm);
  nameInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && nameInp.value.trim()) {
      e.preventDefault();
      m.modal.querySelector("[data-confirm]").click();
    }
  });

  const validateImport = () => {
    errEl.hidden = true;
    errEl.textContent = "";
    parsedImport = null;
    const text = textarea.value.trim();
    if (!text) {
      updateConfirm();
      return;
    }
    try {
      parsedImport = parseImport(text);
    } catch (e) {
      errEl.textContent = e.message;
      errEl.hidden = false;
    }
    updateConfirm();
  };
  textarea.addEventListener("input", validateImport);
  fileInp.addEventListener("change", async () => {
    const f = fileInp.files && fileInp.files[0];
    if (!f) return;
    try {
      textarea.value = await f.text();
      validateImport();
    } catch {
      errEl.textContent = "Datei konnte nicht gelesen werden.";
      errEl.hidden = false;
    }
  });

  for (const btn of tabBtns) btn.onclick = () => setActiveTab(btn.dataset.tab);

  const m = openModal({
    title: "Neuer Plan",
    body,
    confirmLabel: "Erstellen",
    confirmDisabled: true,
    onConfirm: () => {
      if (activeTab === "blank") {
        const name = nameInp.value.trim();
        if (!name) return false;
        createPlan(name);
        savePlans();
        rerender();
      } else {
        if (!parsedImport) return false;
        const newPlan = applyImport(parsedImport);
        state.builderSelectedPlanId = newPlan.id;
        savePlans();
        rerender();
      }
    },
  });

  setActiveTab("blank");
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
  const id = shortId("e_");
  day.exercises.push({
    id,
    name: libEntry.name,
    muscleGroupId: libEntry.muscleGroupId || null,
    sets: null,
    reps: null,
    weight: null,
  });
  // Auto-expand newly added exercises on mobile so the user can fill values
  // immediately without an extra tap.
  state.builderExpanded.add(id);
  plan.updatedAt = new Date().toISOString();
  scheduleSavePlans();
}

function currentPlan() {
  return (state.plans.plans || []).find(
    (p) => p.id === state.builderSelectedPlanId,
  );
}

// --- Plan export modal ------------------------------------------------------

function openExportModal(plan) {
  const formats = [
    { key: "whatsapp", label: "WhatsApp", extension: "txt", mime: "text/plain", build: buildWhatsappExport },
    { key: "markdown", label: "Markdown", extension: "md", mime: "text/markdown", build: buildMarkdownExport },
    { key: "json", label: "JSON", extension: "json", mime: "application/json", build: buildJsonExport },
  ];
  let activeKey = "whatsapp";

  const body = document.createElement("div");
  body.className = "export-body";

  const tabs = document.createElement("div");
  tabs.className = "export-tabs";
  body.appendChild(tabs);

  const preview = document.createElement("textarea");
  preview.className = "export-preview";
  preview.readOnly = true;
  preview.spellcheck = false;
  body.appendChild(preview);

  const actions = document.createElement("div");
  actions.className = "export-extra-actions";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "btn secondary";
  copyBtn.textContent = "In Zwischenablage";
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(preview.value);
    } catch {
      preview.select();
      document.execCommand("copy");
    }
    const prev = copyBtn.textContent;
    copyBtn.textContent = "Kopiert ✓";
    setTimeout(() => (copyBtn.textContent = prev), 1500);
  };
  actions.appendChild(copyBtn);

  const dlBtn = document.createElement("button");
  dlBtn.type = "button";
  dlBtn.className = "btn";
  dlBtn.textContent = "Herunterladen";
  dlBtn.onclick = () => {
    const f = formats.find((x) => x.key === activeKey);
    const safe = plan.name.replace(/[\\/:*?"<>|]/g, "_").trim() || "plan";
    downloadText(preview.value, `${safe}.${f.extension}`, f.mime);
  };
  actions.appendChild(dlBtn);

  body.appendChild(actions);

  const setActive = (key) => {
    activeKey = key;
    const f = formats.find((x) => x.key === key);
    preview.value = f.build(plan);
    for (const t of tabs.querySelectorAll(".export-tab")) {
      t.classList.toggle("active", t.dataset.key === key);
    }
  };

  for (const f of formats) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "export-tab" + (f.key === activeKey ? " active" : "");
    tab.dataset.key = f.key;
    tab.textContent = f.label;
    tab.onclick = () => setActive(f.key);
    tabs.appendChild(tab);
  }
  setActive(activeKey);

  const m = openModal({
    title: "Plan exportieren",
    body,
    confirmLabel: "Schließen",
    confirmDisabled: false,
    onConfirm: () => {},
  });
  m.modal.classList.add("export-modal");
  const cancel = m.modal.querySelector("[data-cancel]");
  if (cancel) cancel.style.display = "none";
}

function buildWhatsappExport(plan) {
  const lines = [`*${plan.name}*`];
  for (const day of plan.days) {
    lines.push("");
    lines.push(`*${day.name}*`);
    if (day.exercises.length === 0) {
      lines.push("_(keine Übungen)_");
      continue;
    }
    for (const ex of day.exercises) {
      lines.push(`• ${formatExerciseLine(ex)}`);
    }
  }
  return lines.join("\n");
}

function buildMarkdownExport(plan) {
  const lines = [`# ${plan.name}`];
  for (const day of plan.days) {
    lines.push("");
    lines.push(`## ${day.name}`);
    lines.push("");
    if (day.exercises.length === 0) {
      lines.push("_(keine Übungen)_");
      continue;
    }
    for (const ex of day.exercises) {
      lines.push(`- ${formatExerciseLine(ex)}`);
    }
  }
  return lines.join("\n");
}

function buildJsonExport(plan) {
  const referenced = new Set();
  for (const day of plan.days) {
    for (const ex of day.exercises) {
      if (ex.muscleGroupId) referenced.add(ex.muscleGroupId);
    }
  }
  const mgs = (state.plans.muscleGroups || [])
    .filter((mg) => referenced.has(mg.id))
    .map((mg) => ({ id: mg.id, name: mg.name, colorKey: mg.colorKey }));
  const payload = {
    kind: "trainingsplan/plan/v1",
    exportedAt: new Date().toISOString(),
    plan: {
      id: plan.id,
      name: plan.name,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      trainingsPerWeek: plan.trainingsPerWeek,
      days: plan.days.map((d) => ({
        id: d.id,
        name: d.name,
        exercises: d.exercises.map((e) => ({
          id: e.id,
          name: e.name,
          muscleGroupId: e.muscleGroupId,
          sets: e.sets,
          reps: e.reps,
          weight: e.weight,
        })),
      })),
    },
    muscleGroups: mgs,
  };
  return JSON.stringify(payload, null, 2);
}

function formatExerciseLine(ex) {
  const mg = findMg(state.plans, ex.muscleGroupId);
  const mgPart = mg ? ` (${mg.name})` : "";
  const sets = Number.isFinite(ex.sets) && ex.sets > 0 ? String(ex.sets) : null;
  const reps = ex.reps != null && String(ex.reps).trim() !== "" ? String(ex.reps).trim() : null;
  const weight = ex.weight != null && String(ex.weight).trim() !== ""
    ? `${String(ex.weight).trim()} kg`
    : null;

  let setsReps = "";
  if (sets && reps) setsReps = `${sets} × ${reps}`;
  else if (sets) setsReps = `${sets} Sätze`;
  else if (reps) setsReps = reps;

  const stats = [setsReps, weight].filter(Boolean);
  const statsPart = stats.length ? ` — ${stats.join(" @ ")}` : "";
  return `${ex.name}${mgPart}${statsPart}`;
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// --- Plan import helpers (used by openCreatePlanModal "Importieren"-tab) ----

function parseImport(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Ungültiges JSON.");
  }
  if (!raw || typeof raw !== "object") throw new Error("Erwarte JSON-Objekt.");
  if (raw.kind !== "trainingsplan/plan/v1") {
    throw new Error(`Unbekanntes Format (${raw.kind || "ohne kind-Feld"}). Erwartet: trainingsplan/plan/v1`);
  }
  if (!raw.plan || typeof raw.plan !== "object") throw new Error("Feld 'plan' fehlt.");
  if (typeof raw.plan.name !== "string" || !raw.plan.name.trim()) {
    throw new Error("Plan-Name fehlt.");
  }
  if (!Array.isArray(raw.plan.days)) throw new Error("Plan-Tage fehlen.");
  for (const day of raw.plan.days) {
    if (!day || typeof day.name !== "string") throw new Error("Ein Tag hat keinen Namen.");
    if (!Array.isArray(day.exercises)) throw new Error(`Tag „${day.name}" hat keine Übungs-Liste.`);
    for (const ex of day.exercises) {
      if (!ex || typeof ex.name !== "string" || !ex.name.trim()) {
        throw new Error(`Tag „${day.name}" enthält eine Übung ohne Namen.`);
      }
    }
  }
  const mgs = Array.isArray(raw.muscleGroups) ? raw.muscleGroups : [];
  return { plan: raw.plan, mgs };
}

function applyImport({ plan, mgs }) {
  // Name-match MGs against existing; create new for unknowns. Library untouched.
  const norm = (s) => String(s || "").trim().toLowerCase();
  const localMgs = state.plans.muscleGroups;
  const mgIdMap = new Map(); // import-mg.id → local-mg.id
  for (const im of mgs) {
    if (!im || typeof im.name !== "string" || !im.name.trim()) continue;
    const match = localMgs.find((m) => norm(m.name) === norm(im.name));
    if (match) {
      mgIdMap.set(im.id, match.id);
    } else {
      const colorKey = PALETTE_KEYS.includes(im.colorKey) ? im.colorKey : DEFAULT_COLOR_KEY;
      const created = { id: shortId("mg_"), name: im.name.trim(), colorKey };
      localMgs.push(created);
      mgIdMap.set(im.id, created.id);
    }
  }

  const now = new Date().toISOString();
  const newPlan = {
    id: shortId("p_"),
    name: plan.name.trim(),
    createdAt: now,
    updatedAt: now,
    days: plan.days.map((d) => ({
      id: shortId("d_"),
      name: d.name.trim() || "Tag",
      exercises: d.exercises.map((ex) => ({
        id: shortId("e_"),
        name: ex.name.trim(),
        muscleGroupId: ex.muscleGroupId ? mgIdMap.get(ex.muscleGroupId) || null : null,
        sets: Number.isFinite(ex.sets) ? ex.sets : null,
        reps: ex.reps != null && String(ex.reps).trim() !== "" ? String(ex.reps) : null,
        weight: ex.weight != null && String(ex.weight).trim() !== "" ? String(ex.weight) : null,
      })),
    })),
  };
  if (Number.isFinite(plan.trainingsPerWeek)) {
    newPlan.trainingsPerWeek = plan.trainingsPerWeek;
  }

  state.plans.plans.push(newPlan);
  return newPlan;
}

// --- Shared-plan preview ----------------------------------------------------

function renderSharedPreview(root, shared, rerender) {
  const { plan, muscleGroups, owner } = shared;
  // Build a lookup from the shared payload's mg-ids to their definition.
  const mgById = new Map((muscleGroups || []).map((m) => [m.id, m]));

  const wrap = document.createElement("div");
  wrap.className = "builder-shared-preview";

  // Header: name, owner, action buttons.
  const header = document.createElement("div");
  header.className = "builder-plan-header builder-shared-header";

  const titleBlock = document.createElement("div");
  titleBlock.className = "builder-shared-title-block";
  const eyebrow = shared.mine
    ? "Geteilter Plan · dein Plan"
    : `Geteilter Plan · von ${ownerDisplay(owner.email)}`;
  titleBlock.innerHTML = `
    <div class="builder-shared-eyebrow">${escape(eyebrow)}</div>
    <h2 class="builder-shared-title">${escape(plan.name)}</h2>
  `;
  header.appendChild(titleBlock);

  const actions = document.createElement("div");
  actions.className = "builder-plan-actions";

  if (shared.mine) {
    // Owner is looking at their own shared plan — show "Privat machen" as the
    // primary action. Cloning your own plan makes no sense.
    const unshareBtn = document.createElement("button");
    unshareBtn.className = "btn";
    unshareBtn.textContent = "Privat machen";
    unshareBtn.onclick = () => {
      const ownPlan = (state.plans.plans || []).find((p) => p.id === plan.id);
      if (!ownPlan) return;
      state.builderSelectedShared = null;
      togglePlanShared(ownPlan, rerender);
    };
    actions.appendChild(unshareBtn);
  } else {
    const cloneBtn = document.createElement("button");
    cloneBtn.className = "btn";
    cloneBtn.textContent = "In meine Pläne übernehmen";
    cloneBtn.onclick = () => cloneSharedPlan(shared, rerender);
    actions.appendChild(cloneBtn);
  }

  const backBtn = document.createElement("button");
  backBtn.className = "btn ghost";
  backBtn.textContent = "Schließen";
  backBtn.onclick = () => {
    state.builderSelectedShared = null;
    rerender();
  };
  actions.appendChild(backBtn);

  header.appendChild(actions);
  wrap.appendChild(header);

  // Day-by-day read-only display.
  const board = document.createElement("div");
  board.className = "builder-board builder-shared-board";
  for (const day of plan.days || []) {
    const col = document.createElement("article");
    col.className = "builder-day";

    const head = document.createElement("div");
    head.className = "builder-day-head";
    const name = document.createElement("div");
    name.className = "builder-day-name";
    name.textContent = day.name || "Tag";
    head.appendChild(name);
    col.appendChild(head);

    const body = document.createElement("div");
    body.className = "builder-day-body";

    for (const ex of day.exercises || []) {
      const box = document.createElement("article");
      box.className = "exercise-box";
      const mg = ex.muscleGroupId ? mgById.get(ex.muscleGroupId) : null;
      if (mg) box.dataset.mgColor = mg.colorKey;

      const exHead = document.createElement("div");
      exHead.className = "exercise-box-head";
      const titles = document.createElement("div");
      titles.className = "exercise-box-titles";
      titles.innerHTML = `
        <div class="exercise-box-name">${escape(ex.name)}</div>
        <div class="exercise-box-mg">${escape(mg ? mg.name : "—")}</div>
      `;
      exHead.appendChild(titles);
      box.appendChild(exHead);

      const inputs = document.createElement("div");
      inputs.className = "exercise-box-inputs";
      for (const [label, value] of [
        ["Sätze", ex.sets],
        ["Wdh.", ex.reps],
        ["kg", ex.weight],
      ]) {
        const field = document.createElement("div");
        field.className = "exercise-box-field";
        field.innerHTML = `
          <span>${escape(label)}</span>
          <div class="exercise-box-readonly">${escape(value == null || value === "" ? "—" : String(value))}</div>
        `;
        inputs.appendChild(field);
      }
      box.appendChild(inputs);
      body.appendChild(box);
    }
    col.appendChild(body);
    board.appendChild(col);
  }
  wrap.appendChild(board);

  root.appendChild(wrap);
}

function cloneSharedPlan(shared, rerender) {
  const body = document.createElement("div");
  const p = document.createElement("p");
  p.className = "modal-hint";
  p.textContent = `„${shared.plan.name}" von ${ownerDisplay(shared.owner.email)} als eigenständige Kopie in deine Pläne übernehmen? Änderungen beim Original ändern deine Kopie nicht.`;
  body.appendChild(p);
  openModal({
    title: "Plan übernehmen",
    body,
    confirmLabel: "Übernehmen",
    confirmDisabled: false,
    onConfirm: () => {
      const newPlan = applyImport({
        plan: shared.plan,
        mgs: shared.muscleGroups || [],
      });
      state.builderSelectedShared = null;
      state.builderSelectedPlanId = newPlan.id;
      savePlans();
      rerender();
    },
  });
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
