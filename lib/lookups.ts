import { db } from "./db";
import { LOOKUP_DEFS, type LookupField } from "./lookup-defs";

type Row = Record<string, unknown>;

type Handler = {
  list: () => Promise<Row[]>;
  create: (data: Row) => Promise<Row>;
  update: (id: string | number, data: Row) => Promise<Row | null>;
  remove: (id: string | number) => Promise<boolean>;
};

function coerceField(field: LookupField, raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === "") {
    if (field.type === "boolean") return false;
    if (field.type === "number") return null;
    return field.required ? "" : null;
  }
  switch (field.type) {
    case "boolean":
      return Boolean(raw);
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case "text":
    case "textarea":
    case "select": {
      let s = typeof raw === "string" ? raw : String(raw);
      s = s.trim();
      if (field.uppercase) s = s.toUpperCase();
      return s;
    }
    default:
      return raw;
  }
}

/** Build a sanitized payload from `body` based on field defs.  */
export function pickPayload(slug: string, body: unknown, mode: "create" | "update"): Row | { error: string } {
  const def = LOOKUP_DEFS[slug];
  if (!def) return { error: `Unknown lookup type: ${slug}` };
  if (!body || typeof body !== "object") return { error: "Invalid body" };

  const input = body as Row;
  const out: Row = {};
  for (const field of def.fields) {
    if (mode === "update" && field.immutable) continue;
    if (!(field.key in input)) {
      if (mode === "create" && field.required) {
        return { error: `${field.label} is required` };
      }
      continue;
    }
    const value = coerceField(field, input[field.key]);
    if (mode === "create" && field.required && (value === null || value === "")) {
      return { error: `${field.label} is required` };
    }
    out[field.key] = value;
  }
  return out;
}

export const LOOKUP_HANDLERS: Record<string, Handler> = {
  facilities: {
    list: () => db.facility.findMany({ orderBy: { name: "asc" } }) as unknown as Promise<Row[]>,
    create: (data) =>
      db.facility.create({
        data: {
          name: String(data.name ?? ""),
          initials: String(data.initials ?? ""),
          facilityType: (data.facilityType as string) || null,
          address: String(data.address ?? ""),
          city: String(data.city ?? ""),
          state: String(data.state ?? "MI"),
          zip: String(data.zip ?? ""),
          phone: (data.phone as string) || null,
          contact: (data.contact as string) || null,
          active: data.active === undefined ? true : Boolean(data.active),
        },
      }) as unknown as Promise<Row>,
    update: (id, data) =>
      db.facility
        .update({
          where: { id: Number(id) },
          data: {
            ...(data.name !== undefined && { name: String(data.name) }),
            ...(data.initials !== undefined && { initials: String(data.initials) }),
            ...(data.facilityType !== undefined && { facilityType: (data.facilityType as string) || null }),
            ...(data.address !== undefined && { address: String(data.address) }),
            ...(data.city !== undefined && { city: String(data.city) }),
            ...(data.state !== undefined && { state: String(data.state) }),
            ...(data.zip !== undefined && { zip: String(data.zip) }),
            ...(data.phone !== undefined && { phone: (data.phone as string) || null }),
            ...(data.contact !== undefined && { contact: (data.contact as string) || null }),
            ...(data.active !== undefined && { active: Boolean(data.active) }),
          },
        })
        .catch(() => null) as unknown as Promise<Row | null>,
    remove: async (id) => {
      try {
        await db.facility.delete({ where: { id: Number(id) } });
        return true;
      } catch {
        return false;
      }
    },
  },

  equipment: {
    list: () =>
      db.equipment.findMany({
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      }) as unknown as Promise<Row[]>,
    create: (data) =>
      db.equipment.create({
        data: {
          name: String(data.name ?? ""),
          abbreviation: String(data.abbreviation ?? ""),
          category: String(data.category ?? "Misc"),
          kind: (data.kind === "accessory" ? "accessory" : "item"),
          hcpcsCode: String(data.hcpcsCode ?? ""),
          parLevel: data.parLevel === null ? null : Number(data.parLevel ?? 0) || null,
          sortOrder: Number(data.sortOrder ?? 0),
          active: data.active === undefined ? true : Boolean(data.active),
        },
      }) as unknown as Promise<Row>,
    update: (id, data) =>
      db.equipment
        .update({
          where: { id: String(id) },
          data: {
            ...(data.name !== undefined && { name: String(data.name) }),
            ...(data.abbreviation !== undefined && { abbreviation: String(data.abbreviation) }),
            ...(data.category !== undefined && { category: String(data.category) }),
            ...(data.kind !== undefined && { kind: (data.kind === "accessory" ? "accessory" : "item") }),
            ...(data.hcpcsCode !== undefined && { hcpcsCode: String(data.hcpcsCode) }),
            ...(data.parLevel !== undefined && { parLevel: data.parLevel === null ? null : Number(data.parLevel) || null }),
            ...(data.sortOrder !== undefined && { sortOrder: Number(data.sortOrder) }),
            ...(data.active !== undefined && { active: Boolean(data.active) }),
          },
        })
        .catch(() => null) as unknown as Promise<Row | null>,
    remove: async (id) => {
      try {
        await db.equipment.delete({ where: { id: String(id) } });
        return true;
      } catch {
        return false;
      }
    },
  },

  insurance: {
    list: () => db.insuranceOption.findMany({ orderBy: { label: "asc" } }) as unknown as Promise<Row[]>,
    create: (data) =>
      db.insuranceOption.create({
        data: {
          key: String(data.key ?? ""),
          label: String(data.label ?? ""),
          coverageType: (data.coverageType as string) || null,
          planVariant: (data.planVariant as string) || null,
          accepted: data.accepted === undefined ? true : Boolean(data.accepted),
          sortOrder: Number(data.sortOrder ?? 0),
          active: data.active === undefined ? true : Boolean(data.active),
        },
      }) as unknown as Promise<Row>,
    update: (id, data) =>
      db.insuranceOption
        .update({
          where: { id: String(id) },
          data: {
            ...(data.label !== undefined && { label: String(data.label) }),
            ...(data.coverageType !== undefined && { coverageType: (data.coverageType as string) || null }),
            ...(data.planVariant !== undefined && { planVariant: (data.planVariant as string) || null }),
            ...(data.accepted !== undefined && { accepted: Boolean(data.accepted) }),
            ...(data.sortOrder !== undefined && { sortOrder: Number(data.sortOrder) }),
            ...(data.active !== undefined && { active: Boolean(data.active) }),
          },
        })
        .catch(() => null) as unknown as Promise<Row | null>,
    remove: async (id) => {
      try {
        await db.insuranceOption.delete({ where: { id: String(id) } });
        return true;
      } catch {
        return false;
      }
    },
  },

  companies: simpleKeyedHandler("fulfillmentCompany"),
  "cancellation-reasons": simpleKeyedHandler("cancellationReason"),
};

function simpleKeyedHandler(modelName: "fulfillmentCompany" | "cancellationReason"): Handler {
  // Both models share { id, key, label, sortOrder, active } — fulfillmentCompany
  // also has `color` (nullable) which we don't expose in the form.
  const m = db[modelName] as unknown as {
    findMany: (args?: unknown) => Promise<Row[]>;
    create: (args: { data: Row }) => Promise<Row>;
    update: (args: { where: { id: string }; data: Row }) => Promise<Row>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
  };
  return {
    list: () => m.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    create: (data) =>
      m.create({
        data: {
          key: String(data.key ?? ""),
          label: String(data.label ?? ""),
          sortOrder: Number(data.sortOrder ?? 0),
          active: data.active === undefined ? true : Boolean(data.active),
        },
      }),
    update: (id, data) =>
      m
        .update({
          where: { id: String(id) },
          data: {
            ...(data.label !== undefined && { label: String(data.label) }),
            ...(data.sortOrder !== undefined && { sortOrder: Number(data.sortOrder) }),
            ...(data.active !== undefined && { active: Boolean(data.active) }),
          },
        })
        .catch(() => null),
    remove: async (id) => {
      try {
        await m.delete({ where: { id: String(id) } });
        return true;
      } catch {
        return false;
      }
    },
  };
}
