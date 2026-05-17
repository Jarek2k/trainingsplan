// Read-only viewer for the active plan. Mobile-first: one day at a time,
// switched via horizontal pill tabs. Tapping an exercise opens an inline
// tracking view (sets with planned values pre-filled, editable).

import {
  clearDeload,
  scheduleSavePlans,
  setActivePlanId,
  setDeload,
  state,
  toggleDeloadReveal,
} from "../state.js";
import { escape, findMg } from "../util.js";
import {
  addSet,
  attachLog,
  findPreviousLog,
  getOrCreateLogToday,
  hasTodayLog,
  removeLastSet,
} from "../logs.js";
import { computeDeloadView, computeWeeklyVolume, deloadKey } from "../deload.js";
import { openModal } from "../modal.js";

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

  // Deload button — toggles the deload view (transient, view-only).
  if (active) {
    const deloadBtn = document.createElement("button");
    const isActive = !!state.deload;
    deloadBtn.className = "icon-btn round" + (isActive ? " active" : "");
    deloadBtn.type = "button";
    // Trending-down arrow inside a circle — reads as "reduced load".
    deloadBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
        <polyline points="17 18 23 18 23 12"/>
      </svg>
    `;
    deloadBtn.title = isActive ? "Deload deaktivieren" : "Deload-Anzeige aktivieren";
    deloadBtn.setAttribute("aria-label", deloadBtn.title);
    deloadBtn.setAttribute("aria-pressed", isActive ? "true" : "false");
    deloadBtn.onclick = () => {
      if (state.deload) {
        clearDeload();
        ctx.switchMode("view");
      } else {
        openDeloadDialog(ctx);
      }
    };
    ctx.modeActions.appendChild(deloadBtn);
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

function openDeloadDialog(ctx) {
  const current = state.deload || { weightPct: 50, volumePct: 50 };

  const body = document.createElement("div");
  body.className = "deload-form";
  body.innerHTML = `
    <p class="modal-hint">Reduzierte Anzeige für eine Deload-Woche. Verändert nur die Anzeige — dein Plan bleibt unverändert.</p>
    <div class="deload-grid">
      <label class="deload-field">
        <span class="deload-field-label">Gewicht</span>
        <div class="deload-input-wrap">
          <input id="deload-weight" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" value="${current.weightPct}" />
          <span>%</span>
        </div>
      </label>
      <label class="deload-field">
        <span class="deload-field-label">Volumen</span>
        <div class="deload-input-wrap">
          <input id="deload-volume" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" value="${current.volumePct}" />
          <span>%</span>
        </div>
      </label>
    </div>
  `;

  const wInp = body.querySelector("#deload-weight");
  const vInp = body.querySelector("#deload-volume");

  openModal({
    title: "Deload aktivieren",
    body,
    confirmLabel: "Aktivieren",
    confirmDisabled: false,
    onConfirm: () => {
      setDeload({ weightPct: Number(wInp.value), volumePct: Number(vInp.value) });
      ctx.switchMode("view");
    },
  });

  setTimeout(() => wInp.focus(), 0);
}

function openDeloadOverview(plan) {
  const deloadView = computeDeloadView(plan, state.deload);
  const originalVol = computeWeeklyVolume(plan, null);
  const reducedVol = computeWeeklyVolume(plan, deloadView);

  const body = document.createElement("div");
  body.className = "deload-overview";

  const hint = document.createElement("p");
  hint.className = "modal-hint";
  hint.textContent = "Tatsächliche Sätze pro Muskelgruppe diese Woche — Plan → Deload.";
  body.appendChild(hint);

  // Sort by original volume desc, so the biggest movers sit at the top.
  const mgs = state.plans.muscleGroups || [];
  const rows = [];
  for (const mg of mgs) {
    const orig = originalVol.get(mg.id) || 0;
    if (orig <= 0) continue;
    const reduced = reducedVol.get(mg.id) || 0;
    rows.push({ mg, orig, reduced });
  }
  rows.sort((a, b) => b.orig - a.orig);

  const list = document.createElement("ul");
  list.className = "deload-overview-list";
  for (const { mg, orig, reduced } of rows) {
    const pct = orig > 0 ? Math.round((reduced / orig) * 100) : 0;
    const delta = pct - 100; // negative = reduction
    const li = document.createElement("li");
    li.className = "deload-overview-row";
    li.dataset.mgColor = mg.colorKey;
    li.innerHTML = `
      <span class="deload-overview-name">${escape(mg.name)}</span>
      <span class="deload-overview-vals">
        <span class="deload-overview-orig">${escape(fmtSets(orig))}</span>
        <span class="deload-overview-arrow" aria-hidden="true">→</span>
        <span class="deload-overview-new">${escape(fmtSets(reduced))}</span>
        <span class="deload-overview-unit">Sätze</span>
      </span>
      <span class="deload-overview-delta">${delta > 0 ? "+" : ""}${delta}%</span>
    `;
    list.appendChild(li);
  }
  body.appendChild(list);

  const m = openModal({
    title: "Deload-Übersicht",
    body,
    confirmLabel: "Schließen",
    confirmDisabled: false,
    onConfirm: () => {},
  });
  // Single-action modal: hide confirm, relabel cancel.
  m.modal.querySelector("[data-confirm]").style.display = "none";
  m.modal.querySelector("[data-cancel]").textContent = "Schließen";
}

function fmtSets(n) {
  // 16 → "16", 13.6 → "13,6"
  if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
  return n.toFixed(1).replace(".", ",");
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

  // Deload banner — sits at the very top because deload is a week-level
  // mode, not specific to the visible day. Tap opens a weekly volume
  // breakdown per muscle group.
  if (state.deload) {
    const banner = document.createElement("button");
    banner.type = "button";
    banner.className = "deload-banner";
    banner.innerHTML = `
      <span class="deload-banner-tag">Deload</span>
      <span class="deload-banner-meta">${escape(String(state.deload.weightPct))}% Gewicht · ${escape(String(state.deload.volumePct))}% Volumen</span>
      <span class="deload-banner-cta" aria-hidden="true">›</span>
    `;
    banner.setAttribute("aria-label", "Deload-Übersicht anzeigen");
    banner.onclick = () => openDeloadOverview(plan);
    wrap.appendChild(banner);
  }

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

  const deloadView = state.deload
    ? computeDeloadView(plan, state.deload)
    : null;

  if (day.exercises.length === 0) {
    const p = document.createElement("p");
    p.className = "viewer-day-empty";
    p.textContent = "Keine Übungen an diesem Tag.";
    dayEl.appendChild(p);
  } else {
    for (const ex of day.exercises) {
      dayEl.appendChild(renderExercise(ex, plan, day, root, ctx, deloadView));
    }
  }
  wrap.appendChild(dayEl);

  root.appendChild(wrap);
}

function renderExercise(ex, plan, day, root, ctx, deloadView) {
  const mg = findMg(state.plans, ex.muscleGroupId);
  const dl = deloadView ? deloadView.get(deloadKey(day.id, ex.id)) : null;
  const paused = !!(dl && dl.paused);
  const inDeload = !!deloadView;
  const revealed = inDeload && state.deloadRevealed.has(ex.id);

  // In deload mode, tracking detail (with input mask) doesn't fit. The row
  // becomes a tap-to-reveal: click toggles whether the original (pre-deload)
  // values are shown inline next to the new ones.
  const row = document.createElement("button");
  row.type = "button";
  row.className =
    "viewer-exercise" +
    (paused ? " paused" : "") +
    (revealed ? " revealed" : "");
  if (mg) row.dataset.mgColor = mg.colorKey;
  row.onclick = inDeload
    ? () => {
        toggleDeloadReveal(ex.id);
        render(root, ctx);
      }
    : () => {
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
  if (paused) {
    const pause = document.createElement("span");
    pause.className = "viewer-exercise-pause";
    pause.textContent = "Pause";
    name.appendChild(pause);
  }
  left.appendChild(name);

  if (mg) {
    const mgEl = document.createElement("div");
    mgEl.className = "viewer-exercise-mg";
    mgEl.textContent = mg.name;
    left.appendChild(mgEl);
  }
  row.appendChild(left);

  // Deloaded values take priority; otherwise show plan values.
  const setsVal = dl ? (paused ? "—" : dl.reducedSets || "—") : ex.sets;
  const repsVal = dl ? dl.reps : ex.reps;
  const weightVal = dl ? (paused ? "—" : dl.weight) : ex.weight;

  // Originals only when the row is "revealed" — default is the clean deload
  // view, click toggles the comparison.
  const showOrig = revealed && dl;
  const setsOrig =
    showOrig && (paused || dl.originalSets !== dl.reducedSets)
      ? dl.originalSets
      : null;
  const weightOrig =
    showOrig && dl.originalWeight != null && (paused || dl.originalWeight !== dl.weight)
      ? dl.originalWeight
      : null;

  const vals = document.createElement("div");
  vals.className = "viewer-exercise-vals";
  vals.appendChild(valChip(setsVal, "Sätze", setsOrig));
  vals.appendChild(valChip(repsVal, "Wdh."));
  vals.appendChild(valChip(weightVal, "kg", weightOrig));
  row.appendChild(vals);

  return row;
}

function valChip(value, unit, original) {
  const chip = document.createElement("div");
  chip.className = "viewer-val" + (original != null ? " changed" : "");
  const v = value == null || value === "" ? "—" : String(value);
  // Old value sits to the LEFT of the current value, muted + smaller. The
  // chip stays a single row tall — no second line, no taller cards.
  const origHtml = original != null
    ? `<span class="viewer-val-orig" title="Plan: ${escape(String(original))}">${escape(String(original))}</span>`
    : "";
  chip.innerHTML = `
    <div class="viewer-val-line">
      ${origHtml}
      <span class="viewer-val-num">${escape(v)}</span>
    </div>
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
