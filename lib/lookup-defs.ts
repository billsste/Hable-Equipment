// Shared lookup definitions used by both the Configuration UI and the server-side
// CRUD handlers. Field metadata drives form rendering, column rendering, and
// payload validation.

export type LookupFieldType = "text" | "textarea" | "number" | "boolean" | "select";

export type LookupField = {
  key: string;
  label: string;
  type: LookupFieldType;
  required?: boolean;
  uppercase?: boolean;
  helper?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  /** Hide from the create form (e.g., immutable `key` on existing rows). */
  immutable?: boolean;
};

export type LookupColumn = {
  key: string;
  label: string;
  width?: number | string;
  /** "code" renders as a monospaced uppercase chip; "boolean" → Active/Disabled pill. */
  render?: "code" | "boolean" | "text" | "type";
};

export type LookupDef = {
  slug: string;
  singular: string;
  plural: string;
  description: string;
  /** PK type. Drives id parsing on edit/delete. */
  idType: "int" | "string";
  /** Is there a stable lookup `key` field (different from `id`)? */
  hasKey: boolean;
  columns: LookupColumn[];
  fields: LookupField[];
  searchKeys: string[];
};

const FACILITY_TYPES = [
  { value: "SNF", label: "Skilled Nursing Facility" },
  { value: "ALF", label: "Assisted Living Facility" },
  { value: "PhysicianGroup", label: "Physician Group" },
  { value: "HomeHealth", label: "Home Health" },
  { value: "HomeDelivery", label: "Home Delivery" },
  { value: "Hospital", label: "Hospital" },
  { value: "Other", label: "Other" },
];

const EQUIPMENT_CATEGORIES = [
  { value: "Wheelchair", label: "Wheelchair" },
  { value: "Walker/Mobility", label: "Walker / Mobility" },
  { value: "Bed", label: "Bed" },
  { value: "Bath/Commode", label: "Bath / Commode" },
  { value: "Respiratory", label: "Respiratory" },
  { value: "Lift", label: "Lift" },
  { value: "Misc", label: "Miscellaneous" },
];

const EQUIPMENT_KINDS = [
  { value: "item", label: "Item" },
  { value: "accessory", label: "Accessory" },
];

const COVERAGE_TYPES = [
  { value: "Medicare", label: "Medicare" },
  { value: "Medicaid", label: "Medicaid" },
  { value: "Commercial", label: "Commercial" },
  { value: "Auto", label: "Auto" },
  { value: "WorkersComp", label: "Workers' Comp" },
  { value: "VA", label: "VA" },
  { value: "PrivatePay", label: "Private Pay" },
  { value: "Other", label: "Other" },
];

const ACTIVE_FIELD: LookupField = { key: "active", label: "Active", type: "boolean" };
const SORT_FIELD: LookupField = { key: "sortOrder", label: "Sort Order", type: "number", helper: "Lower sorts first." };

export const LOOKUP_DEFS: Record<string, LookupDef> = {
  facilities: {
    slug: "facilities",
    singular: "Facility",
    plural: "Facilities",
    description: "Skilled nursing facilities, ALFs, and other delivery sites.",
    idType: "int",
    hasKey: false,
    columns: [
      { key: "initials", label: "Code", width: 90, render: "code" },
      { key: "name", label: "Name" },
      { key: "facilityType", label: "Type", width: 160, render: "type" },
      { key: "city", label: "City", width: 140 },
      { key: "active", label: "Status", width: 100, render: "boolean" },
    ],
    fields: [
      { key: "name", label: "Facility Name", type: "text", required: true },
      { key: "initials", label: "Code / Initials", type: "text", required: true, uppercase: true, helper: "Short code shown in the tracker (e.g., MMW)." },
      { key: "facilityType", label: "Type", type: "select", options: FACILITY_TYPES },
      { key: "address", label: "Street Address", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "state", label: "State", type: "text", uppercase: true },
      { key: "zip", label: "ZIP", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "contact", label: "Primary Contact", type: "text" },
      ACTIVE_FIELD,
    ],
    searchKeys: ["name", "initials", "city", "facilityType"],
  },
  equipment: {
    slug: "equipment",
    singular: "Equipment Item",
    plural: "Equipment",
    description: "Catalog of orderable equipment and accessories.",
    idType: "string",
    hasKey: false,
    columns: [
      { key: "abbreviation", label: "Code", width: 90, render: "code" },
      { key: "name", label: "Name" },
      { key: "category", label: "Category", width: 160 },
      { key: "hcpcsCode", label: "HCPCS", width: 110 },
      { key: "kind", label: "Kind", width: 100, render: "type" },
      { key: "active", label: "Status", width: 100, render: "boolean" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "abbreviation", label: "Abbreviation", type: "text", uppercase: true, helper: "Short code, e.g., HSB." },
      { key: "category", label: "Category", type: "select", required: true, options: EQUIPMENT_CATEGORIES },
      { key: "kind", label: "Kind", type: "select", required: true, options: EQUIPMENT_KINDS },
      { key: "hcpcsCode", label: "HCPCS Code", type: "text", uppercase: true },
      { key: "parLevel", label: "Par Level", type: "number", helper: "Minimum on-hand stock level." },
      SORT_FIELD,
      ACTIVE_FIELD,
    ],
    searchKeys: ["name", "abbreviation", "hcpcsCode", "category"],
  },
  insurance: {
    slug: "insurance",
    singular: "Insurance Plan",
    plural: "Insurance",
    description: "Payors selectable as primary or secondary insurance.",
    idType: "string",
    hasKey: true,
    columns: [
      { key: "key", label: "Key", width: 110, render: "code" },
      { key: "label", label: "Label" },
      { key: "coverageType", label: "Coverage", width: 140 },
      { key: "planVariant", label: "Variant", width: 110 },
      { key: "accepted", label: "Accepted", width: 100, render: "boolean" },
      { key: "active", label: "Status", width: 100, render: "boolean" },
    ],
    fields: [
      { key: "key", label: "Key", type: "text", required: true, uppercase: true, immutable: true, helper: "Stable identifier — cannot be changed after creation." },
      { key: "label", label: "Display Label", type: "text", required: true },
      { key: "coverageType", label: "Coverage Type", type: "select", options: COVERAGE_TYPES },
      { key: "planVariant", label: "Plan Variant", type: "text", helper: "HMO, PPO, Advantage, etc." },
      { key: "accepted", label: "We Accept", type: "boolean" },
      SORT_FIELD,
      ACTIVE_FIELD,
    ],
    searchKeys: ["label", "key", "coverageType", "planVariant"],
  },
  companies: {
    slug: "companies",
    singular: "Fulfillment Company",
    plural: "Fulfillment Companies",
    description: "Outside DME companies orders can be routed to.",
    idType: "string",
    hasKey: true,
    columns: [
      { key: "key", label: "Key", width: 110, render: "code" },
      { key: "label", label: "Label" },
      { key: "sortOrder", label: "Sort", width: 80 },
      { key: "active", label: "Status", width: 100, render: "boolean" },
    ],
    fields: [
      { key: "key", label: "Key", type: "text", required: true, uppercase: true, immutable: true },
      { key: "label", label: "Display Label", type: "text", required: true },
      SORT_FIELD,
      ACTIVE_FIELD,
    ],
    searchKeys: ["label", "key"],
  },
  // "whats-needed" and "item-types" tabs were removed 2026-06. Tracker
  // form now writes pending docs via a hardcoded PENDING_DOCUMENT_OPTIONS
  // list (5 keys) to Order.pendingDocuments. The WhatsNeededOption /
  // ItemTypeOption tables and Order.whatsNeeded column were dropped from
  // the schema in the same pass.
  "cancellation-reasons": {
    slug: "cancellation-reasons",
    singular: "Cancellation Reason",
    plural: "Cancellation Reasons",
    description: "Reasons selectable when cancelling an order.",
    idType: "string",
    hasKey: true,
    columns: [
      { key: "key", label: "Key", width: 130, render: "code" },
      { key: "label", label: "Label" },
      { key: "sortOrder", label: "Sort", width: 80 },
      { key: "active", label: "Status", width: 100, render: "boolean" },
    ],
    fields: [
      { key: "key", label: "Key", type: "text", required: true, uppercase: true, immutable: true },
      { key: "label", label: "Display Label", type: "text", required: true },
      SORT_FIELD,
      ACTIVE_FIELD,
    ],
    searchKeys: ["label", "key"],
  },
};

export const LOOKUP_SLUGS = Object.keys(LOOKUP_DEFS);
