// Curated muscle-group color palette. Keys are stable identifiers stored
// in plans.json; labels are for the CMS picker. Dark + light variants are
// defined in style.css via [data-mg-color="<key>"] selectors.
//
// Sorted as a continuous hue sweep with light→deep shades grouped together:
// reds → oranges → browns → yellows → olives → greens → teals → blues
// → indigos/violets → magentas → pinks → neutral.

export const PALETTE = [
  // Reds
  { key: "crimson", label: "Karmin" },
  { key: "red",     label: "Rot" },
  { key: "coral",   label: "Koralle" },
  // Oranges
  { key: "peach",   label: "Pfirsich" },
  { key: "orange",  label: "Orange" },
  { key: "rust",    label: "Rost" },
  // Browns
  { key: "tan",     label: "Hellbraun" },
  { key: "brown",   label: "Braun" },
  // Ambers / Yellows / Golds
  { key: "amber",   label: "Bernstein" },
  { key: "ochre",   label: "Ocker" },
  { key: "gold",    label: "Gold" },
  { key: "yellow",  label: "Gelb" },
  { key: "mustard", label: "Senf" },
  // Olives / Limes
  { key: "olive",   label: "Oliv" },
  { key: "lime",    label: "Limette" },
  // Greens
  { key: "green",   label: "Grün" },
  { key: "forest",  label: "Waldgrün" },
  { key: "mint",    label: "Mint" },
  // Teals / Cyans
  { key: "teal",    label: "Petrol" },
  { key: "aqua",    label: "Aqua" },
  { key: "cyan",    label: "Cyan" },
  // Blues
  { key: "sky",     label: "Himmel" },
  { key: "blue",    label: "Blau" },
  { key: "navy",    label: "Marine" },
  // Indigos / Violets / Purples
  { key: "indigo",  label: "Indigo" },
  { key: "violet",  label: "Violett" },
  { key: "purple",  label: "Lila" },
  { key: "plum",    label: "Pflaume" },
  // Magentas / Pinks / Roses
  { key: "magenta", label: "Magenta" },
  { key: "fuchsia", label: "Fuchsie" },
  { key: "pink",    label: "Pink" },
  { key: "rose",    label: "Rosé" },
  { key: "blush",   label: "Zartrosa" },
  // Neutral
  { key: "slate",   label: "Schiefer" },
];

export const PALETTE_KEYS = PALETTE.map((p) => p.key);
export const DEFAULT_COLOR_KEY = "rose";
