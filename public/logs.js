// Workout-log helpers. A log entry captures the actual sets done for one
// exercise on one date. Scope: (planId, dayId, exerciseId) — switching to a
// different training day or plan yields a separate history.
//
// Shape of a log entry:
//   { id, planId, dayId, exerciseId, date: "YYYY-MM-DD",
//     sets: [{ reps: string, weight: string }, ...] }

import { shortId, state } from "./state.js";

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function logs() {
  return state.plans?.logs || [];
}

export function findLogToday(planId, dayId, exerciseId) {
  const date = todayISO();
  return (
    logs().find(
      (l) =>
        l.planId === planId &&
        l.dayId === dayId &&
        l.exerciseId === exerciseId &&
        l.date === date,
    ) || null
  );
}

// The most recent log for this exact (plan, day, exercise) — excluding the
// passed-in entry (so the open "today" log doesn't count as its own history).
export function findPreviousLog(planId, dayId, exerciseId, excludeId) {
  let best = null;
  for (const l of logs()) {
    if (l.planId !== planId || l.dayId !== dayId || l.exerciseId !== exerciseId) continue;
    if (excludeId && l.id === excludeId) continue;
    if (!best || (l.date || "") > (best.date || "")) best = l;
  }
  return best;
}

// Build N pre-filled sets from the plan exercise. `reps` and `weight` are
// stored as strings (the plan allows ranges like "8-10").
function buildSetsFromPlan(ex, count) {
  const reps = ex.reps == null ? "" : String(ex.reps);
  const weight = ex.weight == null ? "" : String(ex.weight);
  const out = [];
  for (let i = 0; i < count; i++) out.push({ reps, weight });
  return out;
}

function defaultSetCount(ex) {
  const n = Number(ex.sets);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 3;
}

// Get today's log for this exercise. If none exists yet, returns a pre-filled
// draft that is NOT in state.plans.logs — call attachLog() to persist it.
// This avoids creating empty entries when the user just taps an exercise to
// peek and then goes back.
export function getOrCreateLogToday(planId, dayId, ex) {
  const existing = findLogToday(planId, dayId, ex.id);
  if (existing) return existing;
  return {
    id: shortId("l_"),
    planId,
    dayId,
    exerciseId: ex.id,
    date: todayISO(),
    sets: buildSetsFromPlan(ex, defaultSetCount(ex)),
  };
}

// Make sure the log is part of state.plans.logs. Idempotent.
export function attachLog(log) {
  if (!state.plans.logs.includes(log)) state.plans.logs.push(log);
}

export function addSet(log, ex) {
  const reps = ex.reps == null ? "" : String(ex.reps);
  const weight = ex.weight == null ? "" : String(ex.weight);
  log.sets.push({ reps, weight });
}

export function removeLastSet(log) {
  if (log.sets.length > 1) log.sets.pop();
}

export function hasTodayLog(planId, dayId, exerciseId) {
  return !!findLogToday(planId, dayId, exerciseId);
}
