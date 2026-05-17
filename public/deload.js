// Deload view-model. Pure transformation — never mutates state.plans.
//
// Given a plan and deload parameters (weightPct/volumePct, both 0-100),
// returns a Map keyed by exercise id with the deloaded numbers:
//   { sets, weight, paused, originalSets, originalWeight }
//
// "Paused" means the exercise should be shown but skipped this week (greyed
// out). We pause an exercise occurrence to bring a muscle group's weekly
// volume closer to the volumePct target when per-exercise halving alone
// would leave the MG significantly over target.
//
// Weight rounding: always rounds UP to a gym-friendly plate step.
//   - Original >= 40 kg  → next 10 kg step (Olympic-bar style)
//   - Original < 40 kg   → next 5 kg step (dumbbells / small movements)
// Empty weight (null / "" — body-weight exercises) stays empty.

export function computeDeloadView(plan, { weightPct, volumePct }) {
  const wFactor = weightPct / 100;
  const vFactor = volumePct / 100;
  const out = new Map();

  // Pass 1: per-exercise naive reduction.
  // For each occurrence we attach to its (dayId, exerciseId) — same exercise
  // appearing on two days is two separate occurrences with the same id, but
  // we need to track them per-day because we may pause one day and not the
  // other. We store an array of occurrences per exercise id below.
  const perMg = new Map(); // mgId → [{dayId, exId, originalSets, reducedSets}, ...]

  for (const day of plan.days || []) {
    for (const ex of day.exercises || []) {
      const origSets = Number(ex.sets) || 0;
      const reducedSets = naiveSetReduction(origSets);
      const occ = {
        dayId: day.id,
        exId: ex.id,
        originalSets: origSets,
        reducedSets,
        paused: false,
      };
      if (ex.muscleGroupId) {
        if (!perMg.has(ex.muscleGroupId)) perMg.set(ex.muscleGroupId, []);
        perMg.get(ex.muscleGroupId).push(occ);
      }
      // We also collect even without mg, for weight rounding in pass 2.
      out.set(occKey(day.id, ex.id), {
        ...occ,
        originalWeight: ex.weight ?? null,
        weight: reduceWeight(ex.weight, wFactor),
        originalReps: ex.reps ?? null,
        reps: ex.reps ?? null, // reps stay as-is by design
      });
    }
  }

  // Pass 2: per-MG check. If a MG's reduced volume is still > 65% of target
  // (over target = vFactor + 30% slack), try pausing the LAST occurrence
  // of an exercise that wasn't actually reduced (sets <= 2 stay at original).
  // Repeat until we're at-or-below the band, or no more candidates to pause.
  for (const [, occs] of perMg) {
    const totalOrig = occs.reduce((s, o) => s + o.originalSets, 0);
    if (totalOrig === 0) continue;
    const target = totalOrig * vFactor;
    const overBandMax = target * 1.3; // 30% slack — user said exactness optional

    let current = occs.reduce((s, o) => s + o.reducedSets, 0);
    if (current <= overBandMax) continue;

    // Candidates to pause: occurrences where reducedSets is small (<=2) AND
    // there's still another active occurrence somewhere. Prefer pausing the
    // smallest-set occurrence first (least training value lost), iterate
    // from the back so later weekday gets dropped before earlier.
    const sortable = occs
      .map((o, idx) => ({ o, idx }))
      .filter(({ o }) => !o.paused && o.reducedSets > 0 && o.reducedSets <= 2);
    sortable.sort((a, b) => a.o.reducedSets - b.o.reducedSets || b.idx - a.idx);

    for (const { o } of sortable) {
      if (current <= overBandMax) break;
      // Don't pause if doing so would zero out the MG.
      const remaining = occs.reduce(
        (s, x) => s + (x === o ? 0 : x.paused ? 0 : x.reducedSets),
        0,
      );
      if (remaining === 0) break;
      o.paused = true;
      o.reducedSets = 0;
      current = occs.reduce((s, x) => s + x.reducedSets, 0);
    }

    // Sync the pause flag back into the output map.
    for (const o of occs) {
      const entry = out.get(occKey(o.dayId, o.exId));
      if (entry) {
        entry.paused = o.paused;
        entry.reducedSets = o.reducedSets;
      }
    }
  }

  return out;
}

function naiveSetReduction(sets) {
  if (!Number.isFinite(sets) || sets <= 0) return 0;
  if (sets >= 4) return Math.ceil(sets / 2); // 4→2, 5→3, 6→3, 8→4, 10→5
  if (sets === 3) return 2;
  return sets; // 1 or 2 stays — pausing is handled per-MG later
}

function reduceWeight(weightStr, factor) {
  if (weightStr == null) return null;
  const s = String(weightStr).trim().replace(",", ".");
  if (s === "") return null;
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  const target = n * factor;
  const step = n >= 40 ? 10 : 5;
  // Always round UP — the user prefers slight over-target (heavier but
  // gym-feasible) rather than under-target.
  const rounded = Math.ceil(target / step) * step;
  // Format: drop trailing .0, use comma for decimals (locale-de).
  return formatKg(rounded);
}

function formatKg(n) {
  if (Number.isInteger(n)) return String(n);
  return String(n).replace(".", ",");
}

function occKey(dayId, exId) {
  return `${dayId}::${exId}`;
}

export function deloadKey(dayId, exId) {
  return occKey(dayId, exId);
}

// Raw weekly volume per muscle group — sum of sets across all days of the
// plan, without the trainingsPerWeek cycle factor. This is what you'd
// actually do in one deload week if you follow the plan as-is. The Volume
// bar in the builder DOES apply the cycle factor for a different purpose
// (per-week average across cycles); the two numbers will differ when
// trainingsPerWeek ≠ days.length, that's expected.
export function computeWeeklyVolume(plan, deloadView = null) {
  const out = new Map();
  for (const day of plan.days || []) {
    for (const ex of day.exercises || []) {
      if (!ex.muscleGroupId) continue;
      const sets = deloadView
        ? (deloadView.get(occKey(day.id, ex.id))?.reducedSets ?? 0)
        : (Number.isFinite(ex.sets) ? ex.sets : 0);
      if (sets <= 0) continue;
      out.set(ex.muscleGroupId, (out.get(ex.muscleGroupId) || 0) + sets);
    }
  }
  return out;
}
