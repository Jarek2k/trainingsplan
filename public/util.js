// Pure helpers — no DOM, no state.

export function escape(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

// Parse a value (string|number|null) to a finite number, or null if not numeric.
// Accepts "80", "82.5", "82,5", 80. Rejects "Poser-3", "", null.
export function parseNum(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Compare an old plan value to a new user input for the Day-View progress rule.
// Returns one of:
//   "higher"        new > old, treat as progress -> overwrite
//   "lower"         new < old, plan stays
//   "equal"         no change needed
//   "uncomparable"  one side isn't a number (text marker etc.) -> user edit wins
//   "empty-old"     old is null/empty -> always accept new
export function compareForProgress(oldVal, newVal) {
  const oldEmpty = oldVal == null || oldVal === "";
  const newEmpty = newVal == null || newVal === "";
  if (newEmpty) return "lower"; // clearing a value = no progress, keep plan
  if (oldEmpty) return "empty-old";
  const a = parseNum(oldVal);
  const b = parseNum(newVal);
  if (a == null || b == null) return "uncomparable";
  if (b > a) return "higher";
  if (b < a) return "lower";
  return "equal";
}

// Format a week cell value for display ("80" / 80 -> "80", null -> "—").
export function fmt(v) {
  if (v == null || v === "") return "—";
  return String(v);
}
