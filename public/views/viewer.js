// Read-only viewer for the active plan. Mobile-first: one day at a time,
// switched via horizontal pill tabs. No editing, no inputs, no drag.

import { setActivePlanId, state } from "../state.js";
import { escape } from "../util.js";

export function render(root, ctx) {
  root.innerHTML = "";
  renderModeActions(ctx);

  const plans = state.plans.plans || [];
  if (plans.length === 0) {
    renderEmpty(root, ctx);
    return;
  }

  // Ensure activePlanId points at something real.
  let active = plans.find((p) => p.id === state.activePlanId) || null;
  if (!active && plans.length === 1) {
    setActivePlanId(plans[0].id);
    active = plans[0];
  }
  if (!active) {
    renderPlanPicker(root, ctx);
    return;
  }

  renderPlan(root, active, ctx);
}

// --- Header (mode actions) -------------------------------------------------

function renderModeActions(ctx) {
  if (ctx && ctx.modeActions) ctx.modeActions.innerHTML = "";
  const plans = state.plans.plans || [];
  if (plans.length === 0) return;

  const active = plans.find((p) => p.id === state.activePlanId);

  // Plan picker (only when there are 2+ plans)
  if (plans.length > 1 && active) {
    const select = document.createElement("select");
    select.className = "plan-select";
    select.setAttribute("aria-label", "Plan wählen");
    for (const p of plans) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === active.id) opt.selected = true;
      select.appendChild(opt);
    }
    select.onchange = () => {
      setActivePlanId(select.value);
      state.viewerDayId = null;
      ctx.switchMode("view");
    };
    ctx.modeActions.appendChild(select);
  }

  // Edit button
  if (active) {
    const edit = document.createElement("button");
    edit.className = "btn ghost";
    edit.type = "button";
    edit.innerHTML = `<span aria-hidden="true">✎</span><span class="hide-mobile">Bearbeiten</span>`;
    edit.title = "Plan bearbeiten";
    edit.setAttribute("aria-label", "Plan bearbeiten");
    edit.onclick = () => ctx.switchMode("edit");
    ctx.modeActions.appendChild(edit);
  }
}

// --- Empty / picker --------------------------------------------------------

function renderEmpty(root, ctx) {
  const wrap = document.createElement("div");
  wrap.className = "viewer-empty";
  wrap.innerHTML = `
    <h2>Kein Plan vorhanden</h2>
    <p>Lege deinen ersten Trainingsplan an. Du wechselst dazu in den Bearbeitungsmodus.</p>
  `;
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = "Plan anlegen";
  btn.onclick = () => ctx.switchMode("edit");
  wrap.appendChild(btn);
  root.appendChild(wrap);
}

function renderPlanPicker(root, ctx) {
  const wrap = document.createElement("div");
  wrap.className = "viewer-picker";
  const h = document.createElement("h2");
  h.textContent = "Plan auswählen";
  wrap.appendChild(h);
  const hint = document.createElement("p");
  hint.className = "viewer-picker-hint";
  hint.textContent =
    "Wähle den Plan, den du gerade trainierst. Er wird beim nächsten Öffnen direkt angezeigt.";
  wrap.appendChild(hint);

  const list = document.createElement("ul");
  list.className = "viewer-picker-list";
  for (const p of state.plans.plans) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "viewer-picker-row";
    btn.innerHTML = `
      <span class="viewer-picker-name">${escape(p.name)}</span>
      <span class="viewer-picker-meta">${p.days.length} Tag(e), ${totalExercises(p)} Übung(en)</span>
    `;
    btn.onclick = () => {
      setActivePlanId(p.id);
      ctx.switchMode("view");
    };
    li.appendChild(btn);
    list.appendChild(li);
  }
  wrap.appendChild(list);
  root.appendChild(wrap);
}

function totalExercises(plan) {
  return plan.days.reduce((s, d) => s + d.exercises.length, 0);
}

// --- Plan view -------------------------------------------------------------

function renderPlan(root, plan, ctx) {
  const wrap = document.createElement("div");
  wrap.className = "viewer";

  const title = document.createElement("h1");
  title.className = "viewer-plan-name";
  title.textContent = plan.name;
  wrap.appendChild(title);

  if (plan.days.length === 0) {
    const empty = document.createElement("div");
    empty.className = "viewer-no-days";
    empty.innerHTML = `
      <p>Dieser Plan hat noch keine Trainingstage.</p>
    `;
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Tage hinzufügen";
    btn.onclick = () => ctx.switchMode("edit");
    empty.appendChild(btn);
    wrap.appendChild(empty);
    root.appendChild(wrap);
    return;
  }

  // Resolve selected day.
  let dayId = state.viewerDayId;
  if (!dayId || !plan.days.find((d) => d.id === dayId)) {
    dayId = plan.days[0].id;
    state.viewerDayId = dayId;
  }
  const day = plan.days.find((d) => d.id === dayId);

  // Pill tabs
  const pills = document.createElement("div");
  pills.className = "viewer-pills";
  pills.setAttribute("role", "tablist");
  for (const d of plan.days) {
    const pill = document.createElement("button");
    pill.className = "viewer-pill" + (d.id === dayId ? " active" : "");
    pill.type = "button";
    pill.setAttribute("role", "tab");
    pill.setAttribute("aria-selected", d.id === dayId ? "true" : "false");
    pill.textContent = d.name;
    pill.onclick = () => {
      state.viewerDayId = d.id;
      render(root, ctx);
    };
    pills.appendChild(pill);
  }
  wrap.appendChild(pills);

  // Day content
  const dayEl = document.createElement("section");
  dayEl.className = "viewer-day";

  if (day.exercises.length === 0) {
    const p = document.createElement("p");
    p.className = "viewer-day-empty";
    p.textContent = "Keine Übungen an diesem Tag.";
    dayEl.appendChild(p);
  } else {
    for (const ex of day.exercises) {
      dayEl.appendChild(renderExercise(ex));
    }
  }
  wrap.appendChild(dayEl);

  root.appendChild(wrap);
}

function renderExercise(ex) {
  const row = document.createElement("article");
  row.className = "viewer-exercise";
  row.dataset.mg = ex.muscleGroup || "";

  const left = document.createElement("div");
  left.className = "viewer-exercise-main";

  const name = document.createElement("div");
  name.className = "viewer-exercise-name";
  name.textContent = ex.name;
  left.appendChild(name);

  if (ex.muscleGroup) {
    const mg = document.createElement("div");
    mg.className = "viewer-exercise-mg";
    mg.textContent = ex.muscleGroup;
    left.appendChild(mg);
  }
  row.appendChild(left);

  const vals = document.createElement("div");
  vals.className = "viewer-exercise-vals";
  vals.appendChild(valChip(ex.sets, "Sätze"));
  vals.appendChild(valChip(ex.reps, "Wdh."));
  vals.appendChild(valChip(ex.weight, "kg"));
  row.appendChild(vals);

  return row;
}

function valChip(value, unit) {
  const chip = document.createElement("div");
  chip.className = "viewer-val";
  const v = value == null || value === "" ? "—" : String(value);
  chip.innerHTML = `
    <span class="viewer-val-num">${escape(v)}</span>
    <span class="viewer-val-unit">${escape(unit)}</span>
  `;
  return chip;
}
