// Global app state + persistence for the Builder.
// Mutate state.plans in place, then call scheduleSavePlans() to debounce a PUT.

const SAVE_DEBOUNCE_MS = 600;

export const state = {
  // Loaded from /api/plans. Shape: { plans: [...], exerciseLibrary: [...], muscleGroups: [...] }
  plans: null,
  activePlanId: null, // string | null
  builderDragging: null, // transient: { fromDayId, exerciseId } | null
  compactView: readCompactView(), // UI-only, persisted in localStorage

  saveTimer: null,
  saving: false,
  pendingSave: false,
};

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
}

export function scheduleSavePlans() {
  clearTimeout(state.saveTimer);
  emit("Änderungen…", "saving");
  state.saveTimer = setTimeout(savePlans, SAVE_DEBOUNCE_MS);
}

export async function savePlans() {
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
