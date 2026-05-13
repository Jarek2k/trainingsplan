// Curated muscle-group color palette. Keys are stable identifiers stored
// in plans.json; labels are for the CMS picker. Dark + light variants are
// defined in style.css via [data-mg-color="<key>"] selectors.

export const PALETTE = [
  { key: "rose",    label: "Rosé" },
  { key: "red",     label: "Rot" },
  { key: "coral",   label: "Koralle" },
  { key: "orange",  label: "Orange" },
  { key: "amber",   label: "Bernstein" },
  { key: "ochre",   label: "Ocker" },
  { key: "yellow",  label: "Gelb" },
  { key: "brown",   label: "Braun" },
  { key: "lime",    label: "Limette" },
  { key: "green",   label: "Grün" },
  { key: "mint",    label: "Mint" },
  { key: "teal",    label: "Petrol" },
  { key: "cyan",    label: "Cyan" },
  { key: "sky",     label: "Himmel" },
  { key: "blue",    label: "Blau" },
  { key: "indigo",  label: "Indigo" },
  { key: "violet",  label: "Violett" },
  { key: "purple",  label: "Lila" },
  { key: "magenta", label: "Magenta" },
  { key: "pink",    label: "Pink" },
  { key: "slate",   label: "Schiefer" },
];

export const PALETTE_KEYS = PALETTE.map((p) => p.key);
export const DEFAULT_COLOR_KEY = "rose";
