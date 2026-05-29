// Abbreviation migration manifest.
//
// On 2026-05-07 the equipment catalog was standardized to no-space,
// all-uppercase abbreviations so they're consistent across the picker, print
// tickets, and warehouse labels. This file captures the old → new mapping so
// data imported from any prior system (or earlier exports of this one) can be
// rewritten to the canonical form before insert.
//
// Usage in a migration script:
//   import { migrateAbbreviation } from "./abbreviation-migration";
//   const newAbbr = migrateAbbreviation(row.abbreviation);
//
// The map is exhaustive: every current equipment abbreviation is listed
// (changed or unchanged) so callers can fail-loudly when they encounter an
// abbreviation that isn't in the catalog.

export const ABBREVIATION_MIGRATION: Record<string, string> = {
  // ── Unchanged (already canonical) ──
  "TC17": "TC17",
  "TC19": "TC19",
  "WC16": "WC16",
  "HWC16": "HWC16",
  "WC18": "WC18",
  "HWC18": "HWC18",
  "WC20": "WC20",
  "HWC20": "HWC20",
  "WC22": "WC22",
  "HWC22": "HWC22",
  "WC24": "WC24",
  "HWC24": "HWC24",
  "WC26": "WC26",
  "REC16": "REC16",
  "REC18": "REC18",
  "REC20": "REC20",
  "ELR": "ELR",
  "FR": "FR",
  "2WW": "2WW",
  "ROLL": "ROLL",
  "FE": "FE",
  "APP": "APP",
  "SHEETS": "SHEETS",
  "BSC": "BSC",
  "DAC": "DAC",
  "TTB": "TTB",
  "NEB": "NEB",

  // ── Cushions: spaces removed, x → X ──
  "CSH 16x16": "CSH16X16",
  "CSH 18x16": "CSH18X16",
  "CSH 18x18": "CSH18X18",
  "CSH 20x16": "CSH20X16",
  "CSH 20x18": "CSH20X18",
  "CSH 22x18": "CSH22X18",
  "CSH 24x18": "CSH24X18",
  "CSH 26x18": "CSH26X18",

  // ── Walker / Mobility ──
  "BARI 2WW": "BARI2WW",
  "BARI ROLL": "BARIROLL",
  "HEMI W": "HEMIW",
  "JR W": "JRW",
  "QC SB": "QCSB",
  "QC LB": "QCLB",

  // ── Bed ──
  "BARI BED": "BARIBED",
  "300 MAT": "MAT300",
  "42 MAT": "MAT42",
  "FULL RAIL": "FULLRAIL",
  "HALF RAIL": "HALFRAIL",

  // ── Bath / Commode ──
  "BARI C": "BARIC",
  "BARI DAC": "BARIDAC",
  "SC BACK": "SCBACK",
  "RTS RND": "RTSRND",
  "RTS ELONG": "RTSELONG",

  // ── Respiratory ──
  "O2 BAG": "O2BAG",

  // ── Lift ──
  "MAN LIFT": "MANLIFT",
  "ELEC LIFT": "ELECLIFT",
  "MAN STS": "MANSTS",
  "ELEC STS": "ELECSTS",
  "SLING M": "SLINGM",
  "SLING L": "SLINGL",
  "SLING XL": "SLINGXL",
  "SLING XXL": "SLINGXXL",
  "STS SL M": "STSSLM",
  "STS SL L": "STSSLL",
  "BS STD": "BSSTD",
  "BS LG": "BSLG",
};

// Translates an old abbreviation to its canonical form. Throws if the input
// isn't recognized — migrations should fail loudly so unknown SKUs surface
// during dry-run rather than silently importing as malformed data.
export function migrateAbbreviation(old: string): string {
  const trimmed = old.trim();
  // Exact match first
  if (trimmed in ABBREVIATION_MIGRATION) return ABBREVIATION_MIGRATION[trimmed];
  // Case-insensitive fallback (some legacy exports use lowercase)
  const upper = trimmed.toUpperCase();
  if (upper in ABBREVIATION_MIGRATION) return ABBREVIATION_MIGRATION[upper];
  throw new Error(`Unknown equipment abbreviation in migration source: "${old}"`);
}
