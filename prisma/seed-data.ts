// Reference data captured from client column-walkthrough (see
// memory/project_equip_dispatch_revamp.md for the decision log + open
// discussion points). All seeds are idempotent via key-based upsert.

export const FACILITIES_63: string[] = [
  "Allegria Village",
  "Canterbury on the Lake",
  "Evergreen Health & Rehabilitation Center",
  "Fountain Bleu",
  "Glacier Hills",
  "Greenfield Nursing",
  "Lakeland Center",
  "Lourdes Nursing Center",
  "Maple Manor of Novi",
  "Maple Manor of Wayne",
  "Marywood Nursing Center",
  "Novi Lakes",
  "Optalis Ann Arbor",
  "Optalis Grosse Pointe",
  "Optalis Sterling Heights",
  "Optalis Troy",
  "Riverview Jefferson Health",
  "Shelby Nursing Center",
  "ShorePointe Nursing Center",
  "South Lyon Senior Care",
  "Wellbridge of Brighton",
  "Wellbridge of Novi",
  "Wellbridge of Pinckney",
  "Wellbridge of Rochester",
  "Wellbridge of Romeo",
  "West Bloomfield Nursing Center",
  "West Oaks",
  "Westlake Health",
  "Woodward Hills Nursing Center",
  "Optalis Dearborn",
  "Regency of Livonia",
  "Mission Point of Detroit",
  "Mission Point of Holly",
  "Optalis Dearborn Heights",
  "Sanctuary Bellbrook",
  // Additional 28 from client list to reach 63 (placeholder names — see open question #5)
  "Advantage Living Center",
  "American House Sterling",
  "Autumn Wood Residence",
  "Beacon Hill",
  "Beaumont Health Center",
  "Belmont Manor",
  "Bortz Healthcare",
  "Cambridge South Health Center",
  "Carmen Cardona-Ortiz",
  "Cedarbrook of Bloomfield Hills",
  "Crittenton Hospital",
  "Detroit Receiving Hospital",
  "Fairlane Senior Care",
  "Henry Ford West Bloomfield",
  "Heritage Manor",
  "Imperial of Hazel Park",
  "In House",
  "Lakeshore Senior Living",
  "Macomb Nursing & Rehab",
  "Madonna of Madonna University",
  "Medilodge of Plymouth",
  "Oakland Manor",
  "Pomeroy Living",
  "Provincial House of Sterling Heights",
  "Regency at Bluffs Park",
  "Sanctuary at the Park",
  "St. John Macomb Hospital",
  "Tendercare Westwood",
];

// Action Medical staff (2026-06 client list). Replaces the earlier demo
// users. Emails are the real @actionmedicalequip.com addresses; full names
// are stored so the picker shows "Brent Hable" not just "Brent".
//
// CSRs do intake + verification. Drivers do fulfillment. A few people are
// flagged in MULTI_ROLE_OVERLAPS (below in seed.ts) and live in both lists.
export const CSRS: { name: string; email: string }[] = [
  { name: "Danisha King",          email: "dking@actionmedicalequip.com" },
  { name: "Dawn Fleeson",          email: "dfleeson@actionmedicalequip.com" },
  { name: "Keshawn Hunt",          email: "keshawn@actionmedicalequip.com" },
  { name: "Lorne Green",           email: "lgreen@actionmedicalequip.com" },
  { name: "Melissa Songalewski",   email: "msongalewski@actionmedicalequip.com" },
  { name: "Shane Loch",            email: "sloch@actionmedicalequip.com" },
  { name: "Tyler Fleeson",         email: "tfleeson@actionmedicalequip.com" },
  // Multi-role (also drivers):
  { name: "Brent Hable",           email: "bhable@actionmedicalequip.com" },
  { name: "Gabe Green",            email: "ggreen@actionmedicalequip.com" },
  { name: "Rodney Guyton",         email: "rguyton@actionmedicalequip.com" },
];

// Driver users (formerly dispatchers). Folded into one team per Brent's 2026-06 spec.
export const DISPATCHERS: { name: string; email: string }[] = [
  { name: "Bob Frauce",            email: "bob@actionmedicalequip.com" },
  { name: "Brandon Williams",      email: "brandon@actionmedicalequip.com" },
  { name: "Robert Vadnais",        email: "rvadnais@actionmedicalequip.com" },
  { name: "Terrell Cooks",         email: "tcooks@actionmedicalequip.com" },
  // Multi-role (also CSRs):
  { name: "Brent Hable",           email: "bhable@actionmedicalequip.com" },
  { name: "Gabe Green",            email: "ggreen@actionmedicalequip.com" },
  { name: "Rodney Guyton",         email: "rguyton@actionmedicalequip.com" },
];

export const WHATS_NEEDED: { key: string; label: string; color: string; sortOrder: number }[] = [
  { key: "DX",        label: "Diagnosis Code",   color: "#dc2626", sortOrder: 1 },
  { key: "SIG",       label: "Signature",        color: "#dc2626", sortOrder: 2 },
  { key: "FS",        label: "Face Sheet",       color: "#dc2626", sortOrder: 3 },
  { key: "NOTES",     label: "Notes",            color: "#f59e0b", sortOrder: 4 },
  { key: "PU_DT",     label: "Pickup Date",      color: "#f59e0b", sortOrder: 5 },
  { key: "PEND_CB",   label: "Pending Callback", color: "#8b5cf6", sortOrder: 6 },
  { key: "MGMT_REV",  label: "Mgmt Review",      color: "#8b5cf6", sortOrder: 7 },
  { key: "DC_POST",   label: "DC Post Auth",     color: "#8b5cf6", sortOrder: 8 },
  { key: "ORD_HOLD",  label: "Order Hold",       color: "#64748b", sortOrder: 9 },
  { key: "INS_ISSUE", label: "Insurance Issue",  color: "#dc2626", sortOrder: 10 },
];

// Insurance — full list seeded as-is per client preference. Cleanup deferred (open question #8).
export const INSURANCE_LIST: { key: string; label: string; coverageType?: string; planVariant?: string; accepted?: boolean }[] = [
  { key: "MCARE",                       label: "Medicare",                              coverageType: "Medicare" },
  { key: "MCAID",                       label: "Medicaid",                              coverageType: "Medicaid" },
  { key: "WORKERS_COMP",                label: "Workers Compensation",                  coverageType: "WorkersComp" },
  { key: "VA",                          label: "Veterans Affairs",                      coverageType: "VA" },
  { key: "PP",                          label: "Private Pay",                           coverageType: "PrivatePay" },
  { key: "NA",                          label: "Not Applicable",                        coverageType: "Other" },
  { key: "AETNA",                       label: "Aetna",                                 coverageType: "Commercial" },
  { key: "AETNA_BETTERHEALTH",          label: "Aetna Better Health",                   coverageType: "Medicaid" },
  { key: "AETNA_BETTER_HEALTH_MCAID",   label: "Aetna Better Health (Medicaid)",        coverageType: "Medicaid" },
  { key: "BCBS",                        label: "Blue Cross Blue Shield",                coverageType: "Commercial" },
  { key: "BCN",                         label: "Blue Care Network",                     coverageType: "Commercial" },
  { key: "BCN_ADVANTAGE",               label: "Blue Care Network Advantage",           coverageType: "Medicare", planVariant: "Advantage" },
  { key: "BCBSM_AUTO",                  label: "Blue Cross Blue Shield Michigan (Auto)",coverageType: "Auto" },
  { key: "PRIORITY",                    label: "Priority Health",                       coverageType: "Commercial" },
  { key: "PRIORITY_MCAID",              label: "Priority Health (Medicaid)",            coverageType: "Medicaid" },
  { key: "HUMANA",                      label: "Humana",                                coverageType: "Commercial" },
  { key: "HUMANA_HMO",                  label: "Humana (HMO)",                          coverageType: "Commercial", planVariant: "HMO" },
  { key: "MERIDIAN",                    label: "Meridian",                              coverageType: "Medicaid" },
  { key: "MOLINA",                      label: "Molina",                                coverageType: "Medicaid" },
  { key: "MCLAREN",                     label: "McLaren",                               coverageType: "Commercial" },
  { key: "WELLCARE",                    label: "WellCare",                              coverageType: "Medicare" },
  { key: "WELLCARE_HMO",                label: "WellCare HMO",                          coverageType: "Medicare", planVariant: "HMO" },
  { key: "UHC",                         label: "UnitedHealthcare",                      coverageType: "Commercial" },
  { key: "UHC_PPO",                     label: "UnitedHealthcare PPO",                  coverageType: "Commercial", planVariant: "PPO" },
  { key: "UHC_NOT_ACCEPTED",            label: "UnitedHealthcare (Not Accepted)",       coverageType: "Commercial", accepted: false },
  { key: "UNIVERSITY_OF_MI_HEALTH",     label: "University of Michigan Health",         coverageType: "Commercial" },
  { key: "U_OF_M_HEALTH_ADVANTAGE",     label: "U of M Health Advantage",               coverageType: "Medicare", planVariant: "Advantage" },
  { key: "TRICARE",                     label: "TriCare",                               coverageType: "Other" },
  { key: "CIGNA",                       label: "Cigna",                                 coverageType: "Commercial" },
  { key: "ALLIANCE_HEALTH",             label: "Alliance Health",                       coverageType: "Commercial" },
  { key: "ASCENSION_COMPLETE",          label: "Ascension Complete",                    coverageType: "Commercial" },
  { key: "STATE_FARM_AUTO",             label: "State Farm (Auto)",                     coverageType: "Auto" },
  { key: "PROGRESSIVE_AUTO",            label: "Progressive (Auto)",                    coverageType: "Auto" },
  { key: "ALLSTATE_AUTO",               label: "Allstate (Auto)",                       coverageType: "Auto" },
  { key: "AAA_AUTO",                    label: "AAA (Auto)",                            coverageType: "Auto" },
  { key: "FARM_BUREAU_AUTO",            label: "Farm Bureau (Auto)",                    coverageType: "Auto" },
  { key: "MEMBERS_FIRST_AUTO",          label: "Members First (Auto)",                  coverageType: "Auto" },
  { key: "GEICO_AUTO",                  label: "GEICO (Auto)",                          coverageType: "Auto" },
  { key: "FRANKENMUTH_AUTO",            label: "Frankenmuth (Auto)",                    coverageType: "Auto" },
  { key: "USAA_AUTO",                   label: "USAA (Auto)",                           coverageType: "Auto" },
  { key: "AUTO_OWNERS_AUTO",            label: "Auto Owners (Auto)",                    coverageType: "Auto" },
  { key: "MAPFRE_AUTO",                 label: "MAPFRE (Auto)",                         coverageType: "Auto" },
  { key: "TITAN_AUTO",                  label: "Titan (Auto)",                          coverageType: "Auto" },
  { key: "MEMIC_WC",                    label: "MEMIC (Workers Comp)",                  coverageType: "WorkersComp" },
  { key: "ACCIDENT_FUND_WC",            label: "Accident Fund (Workers Comp)",          coverageType: "WorkersComp" },
  { key: "TRAVELERS_WC",                label: "Travelers (Workers Comp)",              coverageType: "WorkersComp" },
  { key: "HARTFORD_WC",                 label: "Hartford (Workers Comp)",               coverageType: "WorkersComp" },
  { key: "AUTO_OTHER",                  label: "Auto (Other)",                          coverageType: "Auto" },
  { key: "OTHER_PAYER",                 label: "Other",                                 coverageType: "Other" },
];

// Real fulfillment companies only — outcome states (Cancelled, Transferred, Rejected,
// On Hold, Loose Ends, Write Off) live on Order.status; Rep / Facility live on Order.handler.
export const COMPANIES: { key: string; label: string; color?: string }[] = [
  { key: "ACTION",          label: "Action Medical",        color: "#2563eb" },
  { key: "CDME",            label: "Custom DME",            color: "#2563eb" },
  { key: "SHAN",            label: "Shan Medical",          color: "#2563eb" },
  { key: "CARE_ONE",        label: "Care One",              color: "#2563eb" },
  { key: "ADVANCED_MEDICAL",label: "Advanced Medical",      color: "#2563eb" },
];

export const ITEM_TYPES: { key: string; label: string; color: string }[] = [
  { key: "WHEELCHAIR", label: "Wheelchair", color: "#2563eb" },
  { key: "BED",        label: "Bed",        color: "#7c3aed" },
  { key: "LIFT",       label: "Lift",       color: "#0891b2" },
  { key: "CMD",        label: "Commode",    color: "#16a34a" },
  { key: "OXYGEN",     label: "Oxygen",     color: "#dc2626" },
  { key: "WALKER",     label: "Walker",     color: "#0d9488" },
  { key: "WOUND_VAC",  label: "Wound Vac",  color: "#db2777" },
  { key: "MISC",       label: "Misc",       color: "#64748b" },
];

export const CANCELLATION_REASONS: { key: string; label: string }[] = [
  { key: "PATIENT_DECLINED",     label: "Patient Declined" },
  { key: "DUPLICATE",            label: "Duplicate Order" },
  { key: "FACILITY_CANCELLED",   label: "Facility Cancelled" },
  { key: "INS_DENIED",           label: "Insurance Denied" },
  { key: "PATIENT_DECEASED",     label: "Patient Deceased" },
  { key: "WRONG_EQUIPMENT",      label: "Wrong Equipment Ordered" },
  { key: "TRANSFERRED_OUT",      label: "Patient Transferred" },
  { key: "OTHER",                label: "Other" },
];

// Equipment catalog — sourced from the client par sheet. parLevel is the
// minimum on-hand stock the warehouse aims to keep. Sizes/variants match the
// par sheet 1:1 so dispatchers see the same SKUs they count on the floor.
export const EQUIPMENT: {
  category: string;
  name: string;
  abbreviation?: string;
  hcpcsCode?: string;
  kind?: "item" | "accessory";
  parLevel?: number;
}[] = [
  // ── Wheelchair (transport, standard, hemi by width) ──
  { category: "Wheelchair", name: "17\" Transport Chair", abbreviation: "TC17", parLevel: 1 },
  { category: "Wheelchair", name: "19\" Transport Chair", abbreviation: "TC19", parLevel: 1 },
  { category: "Wheelchair", name: "16\" Wheelchair",       abbreviation: "WC16",  hcpcsCode: "K0001", parLevel: 3 },
  { category: "Wheelchair", name: "16\" Hemi Wheelchair",  abbreviation: "HWC16", hcpcsCode: "K0002", parLevel: 3 },
  { category: "Wheelchair", name: "18\" Wheelchair",       abbreviation: "WC18",  hcpcsCode: "K0001", parLevel: 4 },
  { category: "Wheelchair", name: "18\" Hemi Wheelchair",  abbreviation: "HWC18", hcpcsCode: "K0002", parLevel: 4 },
  { category: "Wheelchair", name: "20\" Wheelchair",       abbreviation: "WC20",  hcpcsCode: "K0001", parLevel: 3 },
  { category: "Wheelchair", name: "20\" Hemi Wheelchair",  abbreviation: "HWC20", hcpcsCode: "K0002", parLevel: 3 },
  { category: "Wheelchair", name: "22\" Wheelchair",       abbreviation: "WC22",  hcpcsCode: "K0002", parLevel: 1 },
  { category: "Wheelchair", name: "22\" Hemi Wheelchair",  abbreviation: "HWC22", hcpcsCode: "K0002", parLevel: 1 },
  { category: "Wheelchair", name: "24\" Wheelchair",       abbreviation: "WC24",  hcpcsCode: "K0003", parLevel: 1 },
  { category: "Wheelchair", name: "24\" Hemi Wheelchair",  abbreviation: "HWC24", hcpcsCode: "K0003", parLevel: 1 },
  { category: "Wheelchair", name: "26\" Wheelchair",       abbreviation: "WC26",  hcpcsCode: "K0007", parLevel: 1 },

  // ── Recliner / Geri-Chair ──
  { category: "Recliner", name: "16\" Recliner", abbreviation: "REC16", parLevel: 1 },
  { category: "Recliner", name: "18\" Recliner", abbreviation: "REC18", parLevel: 1 },
  { category: "Recliner", name: "20\" Recliner", abbreviation: "REC20", parLevel: 1 },

  // ── Wheelchair accessories (cushions / leg & foot rests) ──
  { category: "Wheelchair", name: "16\"x16\" Cushion", abbreviation: "CSH16X16", hcpcsCode: "E2601", kind: "accessory", parLevel: 6 },
  { category: "Wheelchair", name: "18\"x16\" Cushion", abbreviation: "CSH18X16", hcpcsCode: "E2601", kind: "accessory", parLevel: 8 },
  { category: "Wheelchair", name: "18\"x18\" Cushion", abbreviation: "CSH18X18", hcpcsCode: "E2601", kind: "accessory", parLevel: 6 },
  { category: "Wheelchair", name: "20\"x16\" Cushion", abbreviation: "CSH20X16", hcpcsCode: "E2601", kind: "accessory", parLevel: 8 },
  { category: "Wheelchair", name: "20\"x18\" Cushion", abbreviation: "CSH20X18", hcpcsCode: "E2601", kind: "accessory", parLevel: 4 },
  { category: "Wheelchair", name: "22\"x18\" Cushion", abbreviation: "CSH22X18", hcpcsCode: "E2601", kind: "accessory", parLevel: 4 },
  { category: "Wheelchair", name: "24\"x18\" Cushion", abbreviation: "CSH24X18", hcpcsCode: "E2601", kind: "accessory", parLevel: 4 },
  { category: "Wheelchair", name: "26\"x18\" Cushion", abbreviation: "CSH26X18", hcpcsCode: "E2601", kind: "accessory", parLevel: 1 },
  { category: "Wheelchair", name: "Elevating Leg Rests", abbreviation: "ELR", hcpcsCode: "K0195", kind: "accessory", parLevel: 8 },
  { category: "Wheelchair", name: "Foot Rests",          abbreviation: "FR",                       kind: "accessory", parLevel: 8 },

  // ── Walker / Mobility ──
  { category: "Walker/Mobility", name: "2-Wheeled Walker",          abbreviation: "2WW",      hcpcsCode: "E0143", parLevel: 8 },
  { category: "Walker/Mobility", name: "Bariatric 2-Wheeled Walker",abbreviation: "BARI2WW", hcpcsCode: "E0149", parLevel: 2 },
  { category: "Walker/Mobility", name: "Rollator",                   abbreviation: "ROLL",     hcpcsCode: "E0143", parLevel: 4 },
  { category: "Walker/Mobility", name: "Bariatric Rollator",         abbreviation: "BARIROLL",hcpcsCode: "E0149", parLevel: 2 },
  { category: "Walker/Mobility", name: "Hemi Walker",                abbreviation: "HEMIW",   hcpcsCode: "E0144", parLevel: 2 },
  { category: "Walker/Mobility", name: "Junior Walker",              abbreviation: "JRW",     hcpcsCode: "E0143", parLevel: 2 },
  { category: "Walker/Mobility", name: "Small Base Quad Cane",       abbreviation: "QCSB",    hcpcsCode: "E0105", parLevel: 2 },
  { category: "Walker/Mobility", name: "Large Base Quad Cane",       abbreviation: "QCLB",    hcpcsCode: "E0105", parLevel: 2 },

  // ── Bed ──
  { category: "Bed", name: "Full Electric Bed",      abbreviation: "FE",       hcpcsCode: "E0265", parLevel: 3 },
  { category: "Bed", name: "Bariatric Bed",           abbreviation: "BARIBED", hcpcsCode: "E0303", parLevel: 1 },
  { category: "Bed", name: "300-Style Mattress",     abbreviation: "MAT300",  hcpcsCode: "E0184", parLevel: 5 },
  { category: "Bed", name: "42\" Bariatric Mattress",abbreviation: "MAT42",   hcpcsCode: "E0277", parLevel: 2 },
  { category: "Bed", name: "Alternating Pressure Pad", abbreviation: "APP",    hcpcsCode: "E0277", parLevel: 2 },
  { category: "Bed", name: "Full Length Bed Rails",  abbreviation: "FULLRAIL",hcpcsCode: "E0305", kind: "accessory", parLevel: 2 },
  { category: "Bed", name: "Half Bed Rails",         abbreviation: "HALFRAIL",hcpcsCode: "E0310", kind: "accessory", parLevel: 6 },
  { category: "Bed", name: "Bed Sheets",             abbreviation: "SHEETS",                       kind: "accessory", parLevel: 2 },

  // ── Bath / Commode ──
  { category: "Bath/Commode", name: "Bedside Commode",            abbreviation: "BSC",      hcpcsCode: "E0163", parLevel: 8 },
  { category: "Bath/Commode", name: "Drop Arm Commode",           abbreviation: "DAC",      hcpcsCode: "E0168", parLevel: 2 },
  { category: "Bath/Commode", name: "Bariatric Commode",          abbreviation: "BARIC",   hcpcsCode: "E0168", parLevel: 2 },
  { category: "Bath/Commode", name: "Bariatric Drop Arm Commode", abbreviation: "BARIDAC", hcpcsCode: "E0168", parLevel: 1 },
  { category: "Bath/Commode", name: "Tub Transfer Bench",         abbreviation: "TTB",      hcpcsCode: "E0247", parLevel: 2 },
  { category: "Bath/Commode", name: "Shower Chair w/ Back",       abbreviation: "SCBACK",  hcpcsCode: "E0240", parLevel: 4 },
  { category: "Bath/Commode", name: "Raised Toilet Seat (Round)",     abbreviation: "RTSRND",   hcpcsCode: "E0244", parLevel: 1 },
  { category: "Bath/Commode", name: "Raised Toilet Seat (Elongated)", abbreviation: "RTSELONG", hcpcsCode: "E0244", parLevel: 2 },

  // ── Respiratory ──
  { category: "Respiratory", name: "Nebulizer",        abbreviation: "NEB",        hcpcsCode: "E0570", parLevel: 2 },
  { category: "Respiratory", name: "Oxygen Bag/Holder",abbreviation: "O2BAG", kind: "accessory", parLevel: 4 },

  // ── Lift ──
  { category: "Lift", name: "Manual Lift",            abbreviation: "MANLIFT", hcpcsCode: "E0630", parLevel: 2 },
  { category: "Lift", name: "Electric Lift",          abbreviation: "ELECLIFT",hcpcsCode: "E0635", parLevel: 1 },
  { category: "Lift", name: "Manual Sit-to-Stand",    abbreviation: "MANSTS",  hcpcsCode: "E0637" },
  { category: "Lift", name: "Electric Sit-to-Stand",  abbreviation: "ELECSTS", hcpcsCode: "E0639", parLevel: 1 },

  // ── Lift accessories (slings + butt straps) ──
  { category: "Lift", name: "Medium Sling",                  abbreviation: "SLINGM",  hcpcsCode: "E0621", kind: "accessory", parLevel: 3 },
  { category: "Lift", name: "Large Sling",                   abbreviation: "SLINGL",  hcpcsCode: "E0621", kind: "accessory", parLevel: 3 },
  { category: "Lift", name: "X-Large Sling",                 abbreviation: "SLINGXL", hcpcsCode: "E0621", kind: "accessory", parLevel: 1 },
  { category: "Lift", name: "XXL Sling",                     abbreviation: "SLINGXXL",hcpcsCode: "E0621", kind: "accessory", parLevel: 1 },
  { category: "Lift", name: "Sit-to-Stand Sling (Medium)",   abbreviation: "STSSLM", hcpcsCode: "E0621", kind: "accessory", parLevel: 1 },
  { category: "Lift", name: "Sit-to-Stand Sling (Large)",    abbreviation: "STSSLL", hcpcsCode: "E0621", kind: "accessory", parLevel: 1 },
  { category: "Lift", name: "Butt Strap (Standard)",         abbreviation: "BSSTD",                       kind: "accessory", parLevel: 1 },
  { category: "Lift", name: "Butt Strap (Large)",            abbreviation: "BSLG",                        kind: "accessory", parLevel: 1 },
];
