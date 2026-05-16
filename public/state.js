// Global app state + persistence for the Builder.
// Mutate state.plans in place, then call scheduleSavePlans() to debounce a PUT.

import { LEGACY_COLOR_MAP, PALETTE_KEYS, DEFAULT_COLOR_KEY } from "./palette.js";

const SAVE_DEBOUNCE_MS = 600;

export const state = {
  // Loaded from /api/plans.
  // Shape: { plans, exerciseLibrary, muscleGroups, activePlanId }
  plans: null,
  // Mirror of state.plans.activePlanId — kept in sync via setActivePlanId().
  // "Active" = the plan currently being trained (shown in viewer by default).
  activePlanId: null,
  // The plan currently open in the builder. Transient, NOT persisted — picking
  // a different plan to edit must not change which plan is "active" for training.
  builderSelectedPlanId: null,
  // "view" (default, read-only training view) | "edit" (builder)
  mode: "view",
  // Currently selected day in viewer (transient).
  viewerDayId: null,
  // When set, the viewer is in tracking-detail mode for this exercise.
  viewerExerciseId: null,
  builderDragging: null, // transient: { fromDayId, exerciseId } | null
  compactView: readCompactView(), // UI-only, persisted in localStorage

  saveTimer: null,
  saving: false,
  pendingSave: false,
};

// --- Active plan / mode ----------------------------------------------------

export function setActivePlanId(id) {
  state.activePlanId = id;
  if (!state.plans) return;
  if (state.plans.activePlanId === id) return;
  state.plans.activePlanId = id;
  scheduleSavePlans();
}

export function setMode(mode) {
  if (mode === "edit" || mode === "manage") state.mode = mode;
  else state.mode = "view";
}

function readCompactView() {
  try {
    return localStorage.getItem("builder.compact") === "1";
  } catch {
    return false;
  }
}

export function setCompactView(on) {
  state.compactView = !!on;
  try {
    localStorage.setItem("builder.compact", on ? "1" : "0");
  } catch {
    // ignore — non-fatal
  }
}

// --- Theme (light / dark) --------------------------------------------------

export function getTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("theme", t);
  } catch {
    // ignore — non-fatal
  }
}

// --- Save status pub/sub ---------------------------------------------------

const listeners = new Set();
export function onSaveStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(text, cls) {
  for (const fn of listeners) fn(text, cls);
}

// --- Plans (Builder) -------------------------------------------------------

export async function loadPlans() {
  const res = await fetch("/api/plans");
  if (!res.ok) throw new Error(`load plans failed: ${res.status}`);
  state.plans = await res.json();
  if (!Array.isArray(state.plans.plans)) state.plans.plans = [];
  if (!Array.isArray(state.plans.exerciseLibrary)) state.plans.exerciseLibrary = [];
  if (!Array.isArray(state.plans.muscleGroups)) state.plans.muscleGroups = [];
  if (!Array.isArray(state.plans.logs)) state.plans.logs = [];

  // Migrate retired colorKeys (rainbow palette refresh).
  let mgsDirty = false;
  const known = new Set(PALETTE_KEYS);
  for (const mg of state.plans.muscleGroups) {
    if (!mg.colorKey || known.has(mg.colorKey)) continue;
    mg.colorKey = LEGACY_COLOR_MAP[mg.colorKey] || DEFAULT_COLOR_KEY;
    mgsDirty = true;
  }
  if (mgsDirty) scheduleSavePlans();

  // Resolve activePlanId: server is source of truth, but fall back gracefully.
  const list = state.plans.plans;
  const stored = state.plans.activePlanId || null;
  if (stored && list.find((p) => p.id === stored)) {
    state.activePlanId = stored;
  } else if (list.length === 1) {
    state.activePlanId = list[0].id;
    state.plans.activePlanId = list[0].id;
  } else {
    state.activePlanId = null;
    state.plans.activePlanId = null;
  }
}

export function scheduleSavePlans() {
  clearTimeout(state.saveTimer);
  emit("Änderungen…", "saving");
  state.saveTimer = setTimeout(savePlans, SAVE_DEBOUNCE_MS);
}

export async function savePlans() {
  // Cancel any pending debounced save — we're flushing now.
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  if (state.saving) {
    state.pendingSave = true;
    return;
  }
  state.saving = true;
  emit("speichert…", "saving");
  try {
    const res = await fetch("/api/plans", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.plans),
      keepalive: true,
    });
    if (!res.ok) throw new Error(`save plans failed: ${res.status}`);
    emit("gespeichert", "saved");
    setTimeout(() => emit("", ""), 1500);
  } catch (err) {
    console.error(err);
    emit("Fehler beim Speichern", "error");
  } finally {
    state.saving = false;
    if (state.pendingSave) {
      state.pendingSave = false;
      savePlans();
    }
  }
}

export function shortId(prefix = "") {
  const r =
    (crypto.randomUUID && crypto.randomUUID().replace(/-/g, "").slice(0, 8)) ||
    Math.random().toString(36).slice(2, 10);
  return prefix + r;
}
