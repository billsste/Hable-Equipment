"use client";

import { useMemo, useState } from "react";
import type { SerialStatus } from "@prisma/client";
import { AlertTriangle, Plus, Search, Trash2, X } from "lucide-react";

export type EquipmentRow = {
  id: string;
  name: string;
  category: string;
  abbreviation: string;
  parLevel: number | null;
  total: number;
  available: number;
  deployed: number;
  out: number;
  retired: number;
  belowPar: boolean;
};

export type SerialRow = {
  id: string;
  sn: string;
  equipmentId: string;
  equipmentName: string;
  equipmentCategory: string;
  equipmentAbbreviation: string;
  status: SerialStatus;
  location: string;
  notes: string;
  orderId: string | null;
  deployedAt: string | null;
  retiredAt: string | null;
  updatedAt: string;
};

const STATUS_LABEL: Record<SerialStatus, string> = {
  available: "Available",
  deployed: "Deployed",
  in_service: "In Service",
  out_of_service: "Out of Service",
  retired: "Retired",
};

const STATUS_COLOR: Record<SerialStatus, { bg: string; color: string }> = {
  available:      { bg: "rgba(21,190,83,0.16)",  color: "#108c3d" },
  deployed:       { bg: "rgba(40,116,173,0.16)", color: "#1f5e8a" },
  in_service:     { bg: "rgba(155,104,41,0.16)", color: "#9b6829" },
  out_of_service: { bg: "rgba(229,72,77,0.14)",  color: "#b03238" },
  retired:        { bg: "rgba(100,116,141,0.16)", color: "#64748d" },
};

type Props = {
  currentUser: { id: number; role: "supplier" | "dispatcher" | "csr" };
  equipment: EquipmentRow[];
  initialSerials: SerialRow[];
};

type Tab = "stock" | "serials";

export default function InventoryClient({ currentUser, equipment, initialSerials }: Props) {
  const canEdit = currentUser.role === "supplier";
  const [tab, setTab] = useState<Tab>("stock");
  const [serials, setSerials] = useState<SerialRow[]>(initialSerials);
  const [search, setSearch] = useState("");
  const [equipmentFilter, setEquipmentFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<SerialStatus | "">("");
  const [adding, setAdding] = useState(false);

  const filteredEquipment = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return equipment;
    return equipment.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      e.abbreviation.toLowerCase().includes(q),
    );
  }, [equipment, search]);

  const filteredSerials = useMemo(() => {
    let list = serials;
    if (equipmentFilter) list = list.filter((s) => s.equipmentId === equipmentFilter);
    if (statusFilter) list = list.filter((s) => s.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        s.sn.toLowerCase().includes(q) ||
        s.equipmentName.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q),
      );
    }
    return list;
  }, [serials, equipmentFilter, statusFilter, search]);

  const belowParCount = equipment.filter((e) => e.belowPar).length;

  function applySerialUpdate(id: string, patch: Partial<SerialRow>) {
    setSerials((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)));
  }
  function appendSerials(news: SerialRow[]) {
    setSerials((prev) => [...news, ...prev]);
  }
  function removeSerial(id: string) {
    setSerials((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="px-4 py-5 md:px-10 md:py-8" style={{ minHeight: "100%" }}>
      <div className="flex items-start justify-between gap-4" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="text-[26px] leading-tight" style={{ color: "#061b31", fontWeight: 300, letterSpacing: "-0.26px" }}>
            Inventory
          </h1>
          <p className="mt-1 text-[14px]" style={{ color: "#64748d", fontWeight: 300 }}>
            On-hand stock by equipment plus a per-serial-number register. Par-level alerts flag what to reorder.
          </p>
        </div>
        {canEdit && tab === "serials" && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded px-4 py-2 text-[14px] text-white"
            style={{ background: "#533afd", fontWeight: 400 }}
          >
            <Plus size={14} /> Add serials
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1" style={{ marginBottom: 16 }}>
        <TabButton active={tab === "stock"} onClick={() => setTab("stock")} label="Stock" count={equipment.length} />
        <TabButton active={tab === "serials"} onClick={() => setTab("serials")} label="Serial Numbers" count={serials.length} />
        {belowParCount > 0 && (
          <span style={{ marginLeft: 8, alignSelf: "center", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#b03238" }}>
            <AlertTriangle size={12} /> {belowParCount} below par
          </span>
        )}
      </div>

      {/* Search/filters */}
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }}>
        <SearchInput value={search} onChange={setSearch} placeholder={tab === "stock" ? "Search equipment..." : "Search SN / equipment / location..."} />
        {tab === "serials" && (
          <>
            <FilterSelect
              value={equipmentFilter}
              onChange={setEquipmentFilter}
              placeholder="All equipment"
              options={equipment.map((e) => ({ value: e.id, label: e.name }))}
            />
            <FilterSelect
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as SerialStatus | "")}
              placeholder="All status"
              options={(Object.keys(STATUS_LABEL) as SerialStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            />
          </>
        )}
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#64748d", fontFeatureSettings: '"tnum"' }}>
          {tab === "stock" ? `${filteredEquipment.length} of ${equipment.length}` : `${filteredSerials.length} of ${serials.length}`}
        </div>
      </div>

      {/* Body */}
      {tab === "stock" ? (
        <StockTable rows={filteredEquipment} onJump={(id) => { setEquipmentFilter(id); setTab("serials"); }} />
      ) : (
        <SerialTable
          rows={filteredSerials}
          canEdit={canEdit}
          onUpdate={applySerialUpdate}
          onDelete={removeSerial}
        />
      )}

      {adding && (
        <AddSerialsModal
          equipment={equipment}
          onClose={() => setAdding(false)}
          onAdded={(created) => { appendSerials(created); setAdding(false); }}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", padding: "6px 12px",
        fontSize: 13, fontWeight: 500, borderRadius: 4,
        ...(active
          ? { background: "rgba(83,58,253,0.08)", color: "#4434d4", border: "1px solid rgba(83,58,253,0.20)" }
          : { background: "transparent", color: "#64748d", border: "1px solid transparent" }),
      }}
    >
      <span>{label}</span>
      <span style={{ marginLeft: 8, color: active ? "#4434d4" : "#94a3b8", fontWeight: 500, fontFeatureSettings: '"tnum"' }}>{count}</span>
    </button>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#fff", border: "1px solid #e5edf5", borderRadius: 4, flex: 1, minWidth: 240, maxWidth: 360 }}>
      <Search size={14} style={{ color: "#94a3b8", flexShrink: 0 }} />
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1, outline: "none", fontSize: 13, background: "transparent", color: "#061b31", border: 0 }}
      />
    </div>
  );
}

function FilterSelect({ value, onChange, placeholder, options }: { value: string; onChange: (v: string) => void; placeholder: string; options: { value: string; label: string }[] }) {
  // For consistency with the Tracker's combobox we'd use Command/Popover, but
  // this short list works fine as a native select within the 5-option rule
  // when filtered. We keep it simple here because the option counts are small.
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "6px 28px 6px 10px", fontSize: 13,
          background: value ? "rgba(83,58,253,0.08)" : "#ffffff",
          color: value ? "#4434d4" : "#273951",
          border: `1px solid ${value ? "rgba(83,58,253,0.20)" : "#e5edf5"}`,
          borderRadius: 4, appearance: "none", minWidth: 170,
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "transparent", border: 0, color: "#4434d4", padding: 0, lineHeight: 0, cursor: "pointer" }}
          title="Clear"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

function StockTable({ rows, onJump }: { rows: EquipmentRow[]; onJump: (equipmentId: string) => void }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5edf5", borderRadius: 6, boxShadow: "rgba(23,23,23,0.06) 0 3px 6px", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f6f9fc", borderBottom: "1px solid #e5edf5" }}>
            <Th>Equipment</Th>
            <Th>Category</Th>
            <Th right>Par</Th>
            <Th right>Available</Th>
            <Th right>Deployed</Th>
            <Th right>Other</Th>
            <Th right>Total</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#64748d" }}>No equipment.</td></tr>
          )}
          {rows.map((e) => (
            <tr
              key={e.id}
              onClick={() => onJump(e.id)}
              style={{ borderBottom: "1px solid #e5edf5", cursor: "pointer", background: "#fff" }}
              onMouseEnter={(ev) => (ev.currentTarget.style.background = "#f6f9fc")}
              onMouseLeave={(ev) => (ev.currentTarget.style.background = "#fff")}
            >
              <Td>
                <span style={{ fontWeight: 500, color: "#061b31" }}>{e.name}</span>
                {e.abbreviation && <span style={{ marginLeft: 6, fontSize: 11, color: "#94a3b8", fontFamily: "SourceCodePro, ui-monospace, monospace" }}>{e.abbreviation}</span>}
              </Td>
              <Td>{e.category}</Td>
              <Td right>{e.parLevel ?? <Muted>—</Muted>}</Td>
              <Td right>
                <span style={{ fontWeight: 500, color: e.belowPar ? "#b03238" : "#108c3d", fontFeatureSettings: '"tnum"' }}>
                  {e.available}
                </span>
                {e.belowPar && (
                  <span style={{ marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 5px", fontSize: 10, color: "#b03238", background: "rgba(229,72,77,0.12)", border: "1px solid rgba(229,72,77,0.25)", borderRadius: 3 }}>
                    <AlertTriangle size={9} /> below par
                  </span>
                )}
              </Td>
              <Td right><span style={{ color: "#1f5e8a", fontWeight: 500, fontFeatureSettings: '"tnum"' }}>{e.deployed}</span></Td>
              <Td right><span style={{ color: "#64748d", fontFeatureSettings: '"tnum"' }}>{e.out + e.retired}</span></Td>
              <Td right><span style={{ color: "#273951", fontWeight: 500, fontFeatureSettings: '"tnum"' }}>{e.total}</span></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SerialTable({ rows, canEdit, onUpdate, onDelete }: {
  rows: SerialRow[]; canEdit: boolean;
  onUpdate: (id: string, patch: Partial<SerialRow>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5edf5", borderRadius: 6, boxShadow: "rgba(23,23,23,0.06) 0 3px 6px", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f6f9fc", borderBottom: "1px solid #e5edf5" }}>
            <Th>SN</Th>
            <Th>Equipment</Th>
            <Th>Status</Th>
            <Th>Location</Th>
            <Th>Order</Th>
            <Th>Updated</Th>
            <Th right></Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#64748d" }}>No serial numbers match.</td></tr>
          )}
          {rows.map((s) => (
            <SerialRowEditor key={s.id} row={s} canEdit={canEdit} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SerialRowEditor({ row, canEdit, onUpdate, onDelete }: {
  row: SerialRow; canEdit: boolean;
  onUpdate: (id: string, patch: Partial<SerialRow>) => void;
  onDelete: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [editingLoc, setEditingLoc] = useState(false);
  const [locDraft, setLocDraft] = useState(row.location);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch(`/api/inventory/serials/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) onUpdate(row.id, body as Partial<SerialRow>);
    } finally { setBusy(false); }
  }

  async function handleDelete() {
    if (!confirm(`Remove serial ${row.sn}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/inventory/serials/${row.id}`, { method: "DELETE" });
      if (r.ok) onDelete(row.id);
    } finally { setBusy(false); }
  }

  return (
    <tr style={{ borderBottom: "1px solid #e5edf5", opacity: busy ? 0.6 : 1 }}>
      <Td>
        <span style={{ fontFamily: "SourceCodePro, ui-monospace, monospace", fontSize: 12, color: "#273951", fontFeatureSettings: '"tnum"' }}>
          {row.sn}
        </span>
      </Td>
      <Td>
        <span style={{ color: "#273951" }}>{row.equipmentName}</span>
        <span style={{ marginLeft: 6, fontSize: 11, color: "#94a3b8" }}>{row.equipmentCategory}</span>
      </Td>
      <Td>
        {canEdit ? (
          <select
            value={row.status}
            disabled={busy}
            onChange={(e) => patch({ status: e.target.value })}
            style={{ padding: "3px 6px", fontSize: 12, fontWeight: 500, color: STATUS_COLOR[row.status].color, background: STATUS_COLOR[row.status].bg, border: `1px solid ${STATUS_COLOR[row.status].color}40`, borderRadius: 3 }}
          >
            {(Object.keys(STATUS_LABEL) as SerialStatus[]).map((s) => (
              <option key={s} value={s} style={{ color: "#273951", background: "#fff" }}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        ) : (
          <span style={{ display: "inline-block", padding: "1px 6px", fontSize: 11, fontWeight: 500, color: STATUS_COLOR[row.status].color, background: STATUS_COLOR[row.status].bg, borderRadius: 4 }}>
            {STATUS_LABEL[row.status]}
          </span>
        )}
      </Td>
      <Td>
        {canEdit ? (
          editingLoc ? (
            <input
              autoFocus
              value={locDraft}
              onChange={(e) => setLocDraft(e.target.value)}
              onBlur={() => {
                setEditingLoc(false);
                if (locDraft !== row.location) patch({ location: locDraft });
              }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setLocDraft(row.location); setEditingLoc(false); } }}
              style={{ padding: "3px 6px", fontSize: 13, color: "#273951", border: "1px solid #533afd", borderRadius: 3, outline: "none", width: 140 }}
            />
          ) : (
            <span onClick={() => setEditingLoc(true)} style={{ color: "#273951", cursor: "text", borderBottom: "1px dashed transparent", padding: "1px 2px" }}>
              {row.location || <Muted>—</Muted>}
            </span>
          )
        ) : (
          <span style={{ color: "#273951" }}>{row.location || <Muted>—</Muted>}</span>
        )}
      </Td>
      <Td>{row.orderId ? <a href={`/tracker?order=${row.orderId}`} style={{ color: "#4434d4", fontSize: 12 }}>{row.orderId.slice(0, 8)}…</a> : <Muted>—</Muted>}</Td>
      <Td>
        <span style={{ fontSize: 12, color: "#64748d", fontFeatureSettings: '"tnum"' }}>
          {new Date(row.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </Td>
      <Td right>
        {canEdit && (
          <button
            type="button"
            disabled={busy}
            onClick={handleDelete}
            style={{ background: "transparent", border: 0, color: "#b03238", cursor: "pointer", padding: 4 }}
            title="Remove serial"
          >
            <Trash2 size={14} />
          </button>
        )}
      </Td>
    </tr>
  );
}

function AddSerialsModal({ equipment, onClose, onAdded }: {
  equipment: EquipmentRow[];
  onClose: () => void;
  onAdded: (created: SerialRow[]) => void;
}) {
  const [equipmentId, setEquipmentId] = useState(equipment[0]?.id ?? "");
  const [sns, setSns] = useState("");
  const [location, setLocation] = useState("Warehouse");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: string[] } | null>(null);

  const lines = sns.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

  async function submit() {
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/inventory/serials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ equipmentId, sns: lines, location }),
      });
      const d = (await r.json()) as { created: SerialRow[]; skipped: string[]; error?: string };
      if (!r.ok) { setErr(d.error ?? "Could not add serials."); return; }
      // POST returns the freshly inserted rows with real CUIDs + timestamps;
      // no more `tmp-` placeholders to 404 on the next PATCH/DELETE.
      setResult({ created: d.created.length, skipped: d.skipped });
      onAdded(d.created);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(6,27,49,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 24, width: 520, maxWidth: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <h2 style={{ fontSize: 17, fontWeight: 500, color: "#061b31", marginBottom: 4 }}>Add serial numbers</h2>
        <p style={{ fontSize: 13, color: "#64748d", marginBottom: 16 }}>Paste one serial per line (or comma-separated). Duplicates are skipped.</p>

        <Label>Equipment</Label>
        <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: "1px solid #e5edf5", borderRadius: 4, marginBottom: 12, background: "#fff", color: "#273951" }}>
          {equipment.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.category})</option>)}
        </select>

        <Label>Location</Label>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: "1px solid #e5edf5", borderRadius: 4, marginBottom: 12, color: "#273951" }}
        />

        <Label>Serial numbers ({lines.length})</Label>
        <textarea
          value={sns}
          onChange={(e) => setSns(e.target.value)}
          rows={6}
          placeholder={"SN-001\nSN-002\nSN-003"}
          style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: "1px solid #e5edf5", borderRadius: 4, marginBottom: 12, fontFamily: "SourceCodePro, ui-monospace, monospace", resize: "vertical" }}
        />

        {err && <div style={{ padding: "8px 12px", fontSize: 12, color: "#b03238", background: "rgba(229,72,77,0.08)", borderRadius: 4, marginBottom: 12 }}>{err}</div>}
        {result && (
          <div style={{ padding: "8px 12px", fontSize: 12, color: "#108c3d", background: "rgba(21,190,83,0.10)", borderRadius: 4, marginBottom: 12 }}>
            Added {result.created}.{result.skipped.length > 0 ? ` Skipped duplicates: ${result.skipped.join(", ")}` : ""}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 14px", fontSize: 13, background: "#fff", border: "1px solid #e5edf5", borderRadius: 4, color: "#273951" }}>
            {result ? "Done" : "Cancel"}
          </button>
          {!result && (
            <button
              type="button" onClick={submit} disabled={busy || lines.length === 0 || !equipmentId}
              style={{ padding: "8px 16px", fontSize: 13, color: "#fff", background: "#533afd", border: 0, borderRadius: 4, fontWeight: 500, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? "Adding..." : `Add ${lines.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th style={{ textAlign: right ? "right" : "left", padding: "10px 12px", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748d", whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
}
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td style={{ padding: "10px 12px", verticalAlign: "middle", textAlign: right ? "right" : "left" }}>{children}</td>;
}
function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#94a3b8" }}>{children}</span>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: "#64748d", marginBottom: 4, fontWeight: 500 }}>{children}</div>;
}
