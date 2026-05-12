// Curated muscle-group color palette. Keys are stable identifiers stored
// in plans.json; labels are for the CMS picker. Dark + light variants are
// defined in style.css via [data-mg-color="<key>"] selectors.

export const PALETTE = [
  { key: "rose",    label: "Rosé" },
  { key: "blue",    label: "Blau" },
  { key: "amber",   label: "Bernstein" },
  { key: "ochre",   label: "Ocker" },
  { key: "violet",  label: "Violett" },
  { key: "magenta", label: "Magenta" },
  { key: "pink",    label: "Pink" },
  { key: "green",   label: "Grün" },
  { key: "mint",    label: "Mint" },
  { key: "lime",    label: "Limette" },
  { key: "orange",  label: "Orange" },
];

export const PALETTE_KEYS = PALETTE.map((p) => p.key);
export const DEFAULT_COLOR_KEY = "rose";
