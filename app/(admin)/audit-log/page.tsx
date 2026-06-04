"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Download, Loader2, Search, X } from "lucide-react";
import { downloadCsv, formatDate } from "@/lib/utils";

type AuditEntry = {
  id: string;
  ts: string;
  who: string;
  role: string;
  action: string;
  detail: string;
  ref: string;
  // Patient label captured when the entry was written. Empty for non-order
  // events (logins, MFA, password changes, etc.).
  patient: string;
};

const ACTION_COLORS: Array<{ match: string; bg: string; color: string }> = [
  { match: "login",    bg: "rgba(21,190,83,0.14)",  color: "#108c3d" },
  { match: "logout",   bg: "rgba(100,116,141,0.10)", color: "#64748d" },
  { match: "create",   bg: "rgba(83,58,253,0.10)",  color: "#4434d4" },
  { match: "update",   bg: "rgba(155,104,41,0.14)", color: "#9b6829" },
  { match: "cancel",   bg: "rgba(229,72,77,0.10)",  color: "#b03238" },
  { match: "assign",   bg: "rgba(83,58,253,0.10)",  color: "#4434d4" },
  { match: "deliver",  bg: "rgba(21,190,83,0.14)",  color: "#108c3d" },
  { match: "order",    bg: "rgba(83,58,253,0.10)",  color: "#4434d4" },
];

function getActionColor(action: string) {
  const lower = action.toLowerCase();
  for (const c of ACTION_COLORS) {
    if (lower.includes(c.match)) return { bg: c.bg, color: c.color };
  }
  return { bg: "rgba(100,116,141,0.10)", color: "#64748d" };
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  useEffect(() => {
    fetch("/api/audit")
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .finally(() => setLoading(false));
  }, []);

  const actionTypes = useMemo(() => [...new Set(entries.map((e) => e.action))].sort(), [entries]);
  const userNames = useMemo(() => [...new Set(entries.map((e) => e.who))].sort(), [entries]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((e) => {
      const matchSearch =
        !q ||
        e.who.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.detail.toLowerCase().includes(q) ||
        e.ref.toLowerCase().includes(q) ||
        // Patient label is the most common search axis for clinical staff
        // tracking a delivery — surface it in the global search.
        (e.patient || "").toLowerCase().includes(q);
      const matchAction = !actionFilter || e.action === actionFilter;
      const matchUser = !userFilter || e.who === userFilter;
      return matchSearch && matchAction && matchUser;
    });
  }, [entries, search, actionFilter, userFilter]);

  function handleExport() {
    const rows: string[][] = [
      ["Timestamp", "User", "Role", "Action", "Reference", "Patient", "Detail"],
      ...filtered.map((e) => [e.ts, e.who, e.role, e.action, e.ref, e.patient, e.detail]),
    ];
    downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1
            className="flex items-center gap-2"
            style={{ color: "#061b31", fontSize: 22, fontWeight: 300, letterSpacing: "-0.22px" }}
          >
            <ClipboardList size={18} /> Audit Log
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "#64748d" }}>
            {filtered.length} of {entries.length} entries
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] disabled:opacity-50"
          style={{
            background: "#ffffff",
            border: "1px solid #e5edf5",
            color: "#273951",
            borderRadius: 4,
            fontWeight: 400,
          }}
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div
        className="mb-4 flex flex-wrap gap-2"
        style={{
          background: "#ffffff",
          border: "1px solid #e5edf5",
          borderRadius: 6,
          padding: 12,
          boxShadow: "rgba(23,23,23,0.06) 0px 3px 6px",
        }}
      >
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={14} style={{ color: "#94a3b8" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by patient, user, action, reference…"
            className="w-full pl-9 pr-3 py-2 text-[13px] outline-none"
            style={{ border: "1px solid #e5edf5", borderRadius: 4, color: "#061b31" }}
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 text-[13px] outline-none"
          style={{ border: "1px solid #e5edf5", borderRadius: 4, color: "#061b31", background: "#ffffff" }}
        >
          <option value="">All actions</option>
          {actionTypes.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="px-3 py-2 text-[13px] outline-none"
          style={{ border: "1px solid #e5edf5", borderRadius: 4, color: "#061b31", background: "#ffffff" }}
        >
          <option value="">All users</option>
          {userNames.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5edf5",
          borderRadius: 6,
          boxShadow: "rgba(23,23,23,0.06) 0px 3px 6px",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin" style={{ color: "#533afd" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16" style={{ color: "#94a3b8" }}>
            <ClipboardList size={28} className="mx-auto mb-3 opacity-40" />
            <p className="text-[13px]">No audit entries</p>
            <p className="text-[12px] mt-1" style={{ color: "#94a3b8" }}>
              Actions appear here as users interact with the system
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead style={{ background: "#f6f9fc" }}>
              <tr style={{ borderBottom: "1px solid #e5edf5" }}>
                {["Timestamp", "User", "Action", "Reference", "Patient", "Detail"].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-2.5 text-left text-[11px] uppercase"
                    style={{ color: "#64748d", letterSpacing: "0.05em", fontWeight: 500 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const ac = getActionColor(entry.action);
                return (
                  <tr
                    key={entry.id}
                    onClick={() => setSelected(entry)}
                    style={{ borderBottom: "1px solid #e5edf5", cursor: "pointer" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "#f6f9fc")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "transparent")}
                  >
                    <td className="px-5 py-3 text-[12px] whitespace-nowrap" style={{ color: "#94a3b8" }}>
                      {formatDate(entry.ts)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-[13px]" style={{ color: "#061b31", fontWeight: 500 }}>{entry.who}</div>
                      <div className="text-[11px] capitalize" style={{ color: "#94a3b8" }}>{entry.role}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="text-[11px] px-1.5 py-0.5"
                        style={{
                          background: ac.bg,
                          color: ac.color,
                          borderRadius: 4,
                          border: `1px solid ${ac.color}33`,
                          fontWeight: 400,
                        }}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {entry.ref ? (
                        <span
                          className="text-[12px] font-mono"
                          style={{ color: "#64748d", fontFeatureSettings: '"tnum"' }}
                        >
                          {entry.ref}
                        </span>
                      ) : (
                        <span style={{ color: "#94a3b8" }}>—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[13px]" style={{ color: "#273951" }}>
                      {entry.patient || <span style={{ color: "#94a3b8" }}>—</span>}
                    </td>
                    <td className="px-5 py-3 text-[13px] max-w-64 truncate" style={{ color: "#64748d" }}>
                      {entry.detail || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selected && <AuditDetail entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AuditDetail({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ac = getActionColor(entry.action);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(6,27,49,0.4)" }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-[520px]"
        style={{
          background: "#ffffff",
          border: "1px solid #e5edf5",
          borderRadius: 8,
          boxShadow:
            "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.10) 0px 18px 36px -18px",
        }}
      >
        <div
          className="flex items-start justify-between px-5 py-3"
          style={{ borderBottom: "1px solid #e5edf5" }}
        >
          <div>
            <div
              className="text-[10px] uppercase mb-1"
              style={{ color: "#94a3b8", letterSpacing: "0.05em", fontWeight: 500 }}
            >
              Audit Entry
            </div>
            <span
              className="text-[12px] px-1.5 py-0.5"
              style={{
                background: ac.bg,
                color: ac.color,
                borderRadius: 4,
                border: `1px solid ${ac.color}33`,
                fontWeight: 500,
              }}
            >
              {entry.action}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="transition-colors"
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              color: "#64748d",
              borderRadius: 4,
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#f6f9fc")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "transparent")}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 text-[13px]">
          <DetailRow label="Who">
            <div style={{ color: "#061b31", fontWeight: 500 }}>{entry.who}</div>
            <div className="text-[11px] capitalize" style={{ color: "#94a3b8" }}>{entry.role}</div>
          </DetailRow>
          <DetailRow label="When">
            <span style={{ color: "#273951" }}>{formatDate(entry.ts)}</span>
          </DetailRow>
          {entry.ref && (
            <DetailRow label="Reference">
              <span
                className="font-mono"
                style={{ color: "#273951", fontFeatureSettings: '"tnum"' }}
              >
                {entry.ref}
              </span>
            </DetailRow>
          )}
          {entry.patient && (
            <DetailRow label="Patient">
              <span style={{ color: "#273951" }}>{entry.patient}</span>
            </DetailRow>
          )}
          <DetailRow label="Detail">
            <div
              style={{
                color: "#273951",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {entry.detail || <span style={{ color: "#94a3b8" }}>—</span>}
            </div>
          </DetailRow>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3">
      <div
        className="text-[11px] uppercase pt-0.5"
        style={{ color: "#94a3b8", letterSpacing: "0.05em", fontWeight: 500 }}
      >
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
