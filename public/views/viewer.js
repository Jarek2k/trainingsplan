// Read-only viewer for the active plan. Mobile-first: one day at a time,
// switched via horizontal pill tabs. Tapping an exercise opens an inline
// tracking view (sets with planned values pre-filled, editable).

import { scheduleSavePlans, setActivePlanId, state } from "../state.js";
import { escape, findMg } from "../util.js";
import {
  addSet,
  attachLog,
  findPreviousLog,
  getOrCreateLogToday,
  hasTodayLog,
  removeLastSet,
} from "../logs.js";

// ESC handler for the tracking detail view. Module-scope so we can detach it
// before every render — leaving the view via Fertig or any state change kills
// the old listener.
let trackingEscHandler = null;
function detachTrackingEsc() {
  if (trackingEscHandler) {
    document.removeEventListener("keydown", trackingEscHandler);
    trackingEscHandler = null;
  }
}

export function render(root, ctx) {
  detachTrackingEsc();
  root.innerHTML = "";
  renderModeActions(ctx);

  const plans = state.plans.plans || [];
  if (plans.length === 0) {
    state.viewerExerciseId = null;
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
    state.viewerExerciseId = null;
    renderPlanPicker(root, ctx);
    return;
  }

  // Sub-routing: tracking detail vs. day overview.
  if (state.viewerExerciseId) {
    const { day, exercise } = resolveTrackingTarget(active);
    if (exercise) {
      renderTracking(root, active, day, exercise, ctx);
      return;
    }
    // Stale ID — drop and fall through to day overview.
    state.viewerExerciseId = null;
  }

  renderPlan(root, active, ctx);
}

function resolveTrackingTarget(plan) {
  for (const d of plan.days) {
    const ex = d.exercises.find((e) => e.id === state.viewerExerciseId);
    if (ex) return { day: d, exercise: ex };
  }
  return { day: null, exercise: null };
}

// --- Header (mode actions) -------------------------------------------------

function renderModeActions(ctx) {
  if (ctx && ctx.modeActions) ctx.modeActions.innerHTML = "";
  const plans = state.plans.plans || [];
  if (plans.length === 0) return;

  const active = plans.find((p) => p.id === state.activePlanId);

  // In tracking detail, hide plan picker + edit button to keep the header tight.
  if (state.viewerExerciseId && active) return;

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
      state.viewerExerciseId = null;
      ctx.switchMode("view");
    };
    ctx.modeActions.appendChild(select);
  }

  // Edit button
  if (active) {
    const edit = document.createElement("button");
    edit.className = "icon-btn round";
    edit.type = "button";
    edit.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
      </svg>
    `;
    edit.title = "Bearbeiten";
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
      dayEl.appendChild(renderExercise(ex, plan, day, root, ctx));
    }
  }
  wrap.appendChild(dayEl);

  root.appendChild(wrap);
}

function renderExercise(ex, plan, day, root, ctx) {
  const mg = findMg(state.plans, ex.muscleGroupId);
  const row = document.createElement("button");
  row.type = "button";
  row.className = "viewer-exercise";
  if (mg) row.dataset.mgColor = mg.colorKey;
  row.onclick = () => {
    state.viewerExerciseId = ex.id;
    render(root, ctx);
  };

  const left = document.createElement("div");
  left.className = "viewer-exercise-main";

  const name = document.createElement("div");
  name.className = "viewer-exercise-name";
  name.textContent = ex.name;
  if (hasTodayLog(plan.id, day.id, ex.id)) {
    const mark = document.createElement("span");
    mark.className = "viewer-exercise-done";
    mark.setAttribute("aria-label", "Heute getrackt");
    mark.title = "Heute getrackt";
    mark.textContent = "✓";
    name.appendChild(mark);
  }
  left.appendChild(name);

  if (mg) {
    const mgEl = document.createElement("div");
    mgEl.className = "viewer-exercise-mg";
    mgEl.textContent = mg.name;
    left.appendChild(mgEl);
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

// --- Tracking detail -------------------------------------------------------

function renderTracking(root, plan, day, ex, ctx) {
  const mg = findMg(state.plans, ex.muscleGroupId);
  const log = getOrCreateLogToday(plan.id, day.id, ex);
  const prev = findPreviousLog(plan.id, day.id, ex.id, log.id);
  const persist = () => {
    attachLog(log);
    scheduleSavePlans();
  };

  const wrap = document.createElement("div");
  wrap.className = "viewer tracking";
  if (mg) wrap.dataset.mgColor = mg.colorKey;

  const closeTracking = () => {
    state.viewerExerciseId = null;
    render(root, ctx);
  };

  // ESC closes the detail view, mirroring how modals behave.
  trackingEscHandler = (e) => {
    if (e.key === "Escape") closeTracking();
  };
  document.addEventListener("keydown", trackingEscHandler);

  const header = document.createElement("div");
  header.className = "tracking-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "tracking-title";
  const h = document.createElement("h1");
  h.textContent = ex.name;
  titleWrap.appendChild(h);
  const sub = document.createElement("div");
  sub.className = "tracking-sub";
  const dayLabel = `${day.name}`;
  sub.textContent = mg ? `${mg.name} · ${dayLabel}` : dayLabel;
  titleWrap.appendChild(sub);
  header.appendChild(titleWrap);

  wrap.appendChild(header);

  // Plan reference strip.
  const planRef = document.createElement("div");
  planRef.className = "tracking-planref";
  planRef.innerHTML = `
    <span class="tracking-planref-label">Plan</span>
    <span>${escape(ex.sets == null ? "—" : String(ex.sets))} Sätze</span>
    <span class="tracking-planref-sep" aria-hidden="true">·</span>
    <span>${escape(ex.reps == null || ex.reps === "" ? "—" : String(ex.reps))} Wdh.</span>
    <span class="tracking-planref-sep" aria-hidden="true">·</span>
    <span>${escape(ex.weight == null || ex.weight === "" ? "—" : String(ex.weight))} kg</span>
  `;
  wrap.appendChild(planRef);

  // Sets list.
  const list = document.createElement("ol");
  list.className = "tracking-sets";
  for (let i = 0; i < log.sets.length; i++) {
    list.appendChild(renderSetRow(log, i, prev, persist));
  }
  wrap.appendChild(list);

  // Set controls (+ / − Satz).
  const controls = document.createElement("div");
  controls.className = "tracking-set-controls";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn ghost";
  addBtn.textContent = "+ Satz";
  addBtn.onclick = () => {
    addSet(log, ex);
    persist();
    render(root, ctx);
  };
  controls.appendChild(addBtn);

  const rmBtn = document.createElement("button");
  rmBtn.type = "button";
  rmBtn.className = "btn ghost";
  rmBtn.textContent = "− Satz";
  rmBtn.disabled = log.sets.length <= 1;
  rmBtn.onclick = () => {
    removeLastSet(log);
    persist();
    render(root, ctx);
  };
  controls.appendChild(rmBtn);

  wrap.appendChild(controls);

  // Done button (just navigation — auto-save covers persistence).
  const done = document.createElement("button");
  done.type = "button";
  done.className = "tracking-done";
  done.textContent = "Fertig";
  done.onclick = closeTracking;
  wrap.appendChild(done);

  root.appendChild(wrap);
}

function renderSetRow(log, idx, prev, persist) {
  const row = document.createElement("li");
  row.className = "tracking-set";

  const num = document.createElement("div");
  num.className = "tracking-set-num";
  num.textContent = String(idx + 1);
  row.appendChild(num);

  const set = log.sets[idx];

  const repsCell = document.createElement("label");
  repsCell.className = "tracking-set-field";
  repsCell.innerHTML = `<span class="tracking-set-label">Wdh.</span>`;
  const repsInput = document.createElement("input");
  repsInput.type = "text";
  repsInput.inputMode = "numeric";
  repsInput.autocomplete = "off";
  repsInput.value = set.reps ?? "";
  repsInput.oninput = () => {
    set.reps = repsInput.value;
    persist();
  };
  repsCell.appendChild(repsInput);
  const prevReps = prev?.sets?.[idx]?.reps;
  if (prevReps != null && prevReps !== "") {
    const last = document.createElement("span");
    last.className = "tracking-set-prev";
    last.title = "Letztes Mal";
    last.textContent = String(prevReps);
    repsCell.appendChild(last);
  }
  row.appendChild(repsCell);

  const wCell = document.createElement("label");
  wCell.className = "tracking-set-field";
  wCell.innerHTML = `<span class="tracking-set-label">kg</span>`;
  const wInput = document.createElement("input");
  wInput.type = "text";
  wInput.inputMode = "decimal";
  wInput.autocomplete = "off";
  wInput.value = set.weight ?? "";
  wInput.oninput = () => {
    set.weight = wInput.value;
    persist();
  };
  wCell.appendChild(wInput);
  const prevWeight = prev?.sets?.[idx]?.weight;
  if (prevWeight != null && prevWeight !== "") {
    const last = document.createElement("span");
    last.className = "tracking-set-prev";
    last.title = "Letztes Mal";
    last.textContent = String(prevWeight);
    wCell.appendChild(last);
  }
  row.appendChild(wCell);

  return row;
}
