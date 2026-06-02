import { db } from "./db";

// `dispatcher` is kept for back-compat in this commit; a follow-up migration
// drops it once the backfill has migrated every existing user to `driver`.
export type UserRole = "supplier" | "driver" | "dispatcher" | "csr";

export type AuditEntry = {
  id: string;
  ts: string;
  who: string;
  role: string;
  action: string;
  detail: string;
  ref: string;
};

export type User = {
  id: number;
  name: string;
  email: string;
  password: string;
  role: UserRole;
};

export type Facility = {
  id: number;
  name: string;
  initials: string;
  active: boolean;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  contact: string | null;
};

function mapUser(u: { id: number; name: string; email: string; password: string; role: string }): User {
  return { id: u.id, name: u.name, email: u.email, password: u.password, role: u.role as UserRole };
}

function mapFacility(f: {
  id: number;
  name: string;
  initials: string;
  active: boolean;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  contact: string | null;
}): Facility {
  return {
    id: f.id,
    name: f.name,
    initials: f.initials,
    active: f.active,
    address: f.address,
    city: f.city,
    state: f.state,
    zip: f.zip,
    phone: f.phone,
    contact: f.contact,
  };
}

class EquipStore {
  // ── Facilities ────────────────────────────────────────────────────────────

  async getFacilities(): Promise<Facility[]> {
    const rows = await db.facility.findMany({ orderBy: { name: "asc" } });
    return rows.map(mapFacility);
  }

  async getFacility(id: number): Promise<Facility | undefined> {
    const f = await db.facility.findUnique({ where: { id } });
    return f ? mapFacility(f) : undefined;
  }

  async addFacility(data: Omit<Facility, "id">): Promise<Facility> {
    const f = await db.facility.create({ data });
    return mapFacility(f);
  }

  async updateFacility(id: number, patch: Partial<Facility>): Promise<Facility | null> {
    const f = await db.facility.update({ where: { id }, data: patch }).catch(() => null);
    return f ? mapFacility(f) : null;
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async getUsers(): Promise<User[]> {
    const rows = await db.user.findMany({ orderBy: { id: "asc" } });
    return rows.map(mapUser);
  }

  async getUser(id: number): Promise<User | undefined> {
    const u = await db.user.findUnique({ where: { id } });
    return u ? mapUser(u) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const u = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    return u ? mapUser(u) : undefined;
  }

  async createUser(data: Omit<User, "id">): Promise<User> {
    const u = await db.user.create({
      data: { name: data.name, email: data.email.toLowerCase(), password: data.password, role: data.role },
    });
    return mapUser(u);
  }

  async removeUser(id: number): Promise<boolean> {
    await db.user.delete({ where: { id } }).catch(() => null);
    return true;
  }

  // ── Audit Log ─────────────────────────────────────────────────────────────

  async getAuditLog(): Promise<AuditEntry[]> {
    const rows = await db.auditEntry.findMany({ orderBy: { ts: "desc" } });
    return rows.map((a) => ({ id: a.id, ts: a.ts.toISOString(), who: a.who, role: a.role, action: a.action, detail: a.detail, ref: a.ref }));
  }

  async addAuditEntry(entry: Omit<AuditEntry, "id">): Promise<AuditEntry> {
    const a = await db.auditEntry.create({
      data: { who: entry.who, role: entry.role, action: entry.action, detail: entry.detail, ref: entry.ref, ts: new Date(entry.ts) },
    });
    return { id: a.id, ts: a.ts.toISOString(), who: a.who, role: a.role, action: a.action, detail: a.detail, ref: a.ref };
  }
}

export const equipStore = new EquipStore();
