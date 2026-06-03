"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, X, AlertTriangle, Trash2 } from "lucide-react";
import type { LookupDef, LookupField } from "@/lib/lookup-defs";

type Row = Record<string, unknown> & { id: string | number };

type Props = {
  defs: Record<string, LookupDef>;
};

export default function ConfigurationClient({ defs }: Props) {
  const slugs = useMemo(() => Object.keys(defs), [defs]);
  const [activeSlug, setActiveSlug] = useState(slugs[0]);
  const def = defs[activeSlug];

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [editing, setEditing] = useState<Row | "new" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/lookups/${activeSlug}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setRows((d.rows ?? []) as Row[]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSlug]);

  const filtered = useMemo(() => {
    let list = rows;
    if (showOnlyActive) list = list.filter((r) => r.active !== false);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        def.searchKeys.some((k) => {
          const v = r[k];
          return typeof v === "string" && v.toLowerCase().includes(q);
        }),
      );
    }
    return list;
  }, [rows, search, showOnlyActive, def.searchKeys]);

  const counts = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.active !== false).length;
    return { total, active, inactive: total - active };
  }, [rows]);

  function handleSaved(row: Row) {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === row.id);
      if (idx === -1) return [row, ...prev];
      const next = prev.slice();
      next[idx] = row;
      return next;
    });
    setEditing(null);
  }

  function handleDeleted(id: string | number) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setEditing(null);
  }

  return (
    <div className="px-4 py-5 md:px-10 md:py-8" style={{ minHeight: "100%" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4" style={{ marginBottom: 24 }}>
        <div>
          <h1
            className="text-[26px] leading-tight"
            style={{ color: "#061b31", fontWeight: 300, letterSpacing: "-0.26px" }}
          >
            Dropdown Selections
          </h1>
          <p className="mt-1 text-[14px]" style={{ color: "#64748d", fontWeight: 300 }}>
            Manage the lookup data — facilities, equipment, insurance, and the rest of the dropdowns the tracker uses.
          </p>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-1" style={{ marginBottom: 12 }}>
        {slugs.map((slug) => {
          const d = defs[slug];
          const active = activeSlug === slug;
          return (
            <button
              key={slug}
              onClick={() => {
                setActiveSlug(slug);
                setSearch("");
                setShowOnlyActive(false);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 4,
                transition: "background-color 100ms, color 100ms",
                ...(active
                  ? { background: "rgba(83,58,253,0.08)", color: "#4434d4", border: "1px solid rgba(83,58,253,0.20)" }
                  : { background: "transparent", color: "#64748d", border: "1px solid transparent" }),
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.background = "#f6f9fc";
                  (e.currentTarget as HTMLButtonElement).style.color = "#273951";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  (e.currentTarget as HTMLButtonElement).style.color = "#64748d";
                }
              }}
            >
              {d.plural}
            </button>
          );
        })}
      </div>

      {/* Section header */}
      <div className="flex items-start justify-between gap-3" style={{ marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, color: "#061b31" }}>{def.plural}</div>
          <div style={{ fontSize: 12, color: "#64748d", marginTop: 2 }}>{def.description}</div>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[13px] text-white"
          style={{ background: "#533afd", fontWeight: 500 }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#4434d4")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#533afd")}
        >
          <Plus size={13} /> Add {def.singular}
        </button>
      </div>

      {/* Search + summary */}
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            background: "#ffffff",
            border: "1px solid #e5edf5",
            borderRadius: 4,
            flex: 1,
            minWidth: 240,
            maxWidth: 360,
          }}
        >
          <Search size={14} style={{ color: "#94a3b8", flexShrink: 0 }} />
          <input
            placeholder={`Search ${def.plural.toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              outline: "none",
              fontSize: 13,
              background: "transparent",
              color: "#061b31",
              border: 0,
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => setShowOnlyActive((v) => !v)}
          style={{
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 4,
            ...(showOnlyActive
              ? { background: "rgba(83,58,253,0.08)", color: "#4434d4", border: "1px solid rgba(83,58,253,0.20)" }
              : { background: "#ffffff", color: "#64748d", border: "1px solid #e5edf5" }),
          }}
        >
          Active only
        </button>

        <div style={{ marginLeft: "auto", fontSize: 12, color: "#64748d", fontFeatureSettings: '"tnum"' }}>
          {filtered.length} of {counts.total} • {counts.active} active
        </div>
      </div>

      {/* Table */}
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
          <div className="flex items-center justify-center" style={{ padding: 48 }}>
            <Loader2 size={20} className="animate-spin" style={{ color: "#533afd" }} />
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                minWidth: 720,
                borderCollapse: "collapse",
                fontSize: 13,
                tableLayout: "auto",
              }}
            >
              <colgroup>
                {def.columns.map((c) => (
                  <col key={c.key} style={c.width ? { width: c.width } : undefined} />
                ))}
              </colgroup>
              <thead>
                <tr style={{ background: "#f6f9fc", borderBottom: "1px solid #e5edf5" }}>
                  {def.columns.map((c) => (
                    <th
                      key={c.key}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        fontSize: 11,
                        fontWeight: 500,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "#64748d",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={def.columns.length}
                      style={{ padding: 32, textAlign: "center", color: "#64748d", fontSize: 13 }}
                    >
                      {rows.length === 0 ? `No ${def.plural.toLowerCase()} yet.` : "No matches."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr
                      key={String(row.id)}
                      onClick={() => setEditing(row)}
                      style={{
                        borderBottom: "1px solid #e5edf5",
                        cursor: "pointer",
                        transition: "background-color 100ms",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f9fc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
                    >
                      {def.columns.map((c) => (
                        <td
                          key={c.key}
                          style={{
                            padding: "10px 12px",
                            verticalAlign: "middle",
                            whiteSpace: c.render === "code" || c.render === "boolean" || c.render === "type" ? "nowrap" : undefined,
                          }}
                        >
                          <Cell value={row[c.key]} render={c.render} />
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <EditDrawer
          key={`${activeSlug}:${editing === "new" ? "new" : String(editing.id)}`}
          def={def}
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}

function Cell({ value, render }: { value: unknown; render?: "code" | "boolean" | "text" | "type" }) {
  if (value === null || value === undefined || value === "") {
    return <span style={{ color: "#94a3b8" }}>—</span>;
  }
  if (render === "boolean") {
    const on = Boolean(value);
    return (
      <span
        style={{
          display: "inline-block",
          fontSize: 11,
          fontWeight: 500,
          padding: "1px 6px",
          borderRadius: 4,
          background: on ? "rgba(21,190,83,0.14)" : "rgba(100,116,141,0.10)",
          color: on ? "#108c3d" : "#64748d",
          border: `1px solid ${on ? "rgba(21,190,83,0.30)" : "rgba(100,116,141,0.20)"}`,
        }}
      >
        {on ? "Active" : "Disabled"}
      </span>
    );
  }
  if (render === "code") {
    return (
      <span
        style={{
          display: "inline-block",
          fontFamily: "SourceCodePro, ui-monospace, SFMono-Regular, monospace",
          fontSize: 11,
          fontWeight: 500,
          padding: "1px 6px",
          borderRadius: 4,
          background: "rgba(83,58,253,0.08)",
          color: "#4434d4",
          letterSpacing: "0.02em",
        }}
      >
        {String(value)}
      </span>
    );
  }
  if (render === "type") {
    return (
      <span style={{ fontSize: 12, color: "#273951", textTransform: "capitalize" }}>
        {String(value)}
      </span>
    );
  }
  return <span style={{ color: "#273951" }}>{String(value)}</span>;
}

function EditDrawer({
  def,
  row,
  onClose,
  onSaved,
  onDeleted,
}: {
  def: LookupDef;
  row: Row | null;
  onClose: () => void;
  onSaved: (row: Row) => void;
  onDeleted: (id: string | number) => void;
}) {
  const isCreate = row === null;
  const initialValues = useMemo<Row>(() => {
    if (row) return { ...row };
    const v: Row = { id: "" };
    for (const f of def.fields) {
      if (f.type === "boolean") v[f.key] = f.key === "active" || f.key === "accepted" ? true : false;
      else if (f.type === "number") v[f.key] = 0;
      else v[f.key] = "";
    }
    return v;
  }, [def, row]);

  const [values, setValues] = useState<Row>(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function setField(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const url = isCreate ? `/api/lookups/${def.slug}` : `/api/lookups/${def.slug}/${row!.id}`;
      const res = await fetch(url, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Could not save ${def.singular.toLowerCase()}.`);
        return;
      }
      onSaved(data.row as Row);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!row) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/lookups/${def.slug}/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not delete.");
        return;
      }
      onDeleted(row.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(6,27,49,0.4)" }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative z-10 max-h-[92vh] w-full max-w-[640px] overflow-hidden flex flex-col"
        style={{
          background: "#ffffff",
          borderRadius: 8,
          boxShadow:
            "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.10) 0px 18px 36px -18px",
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid #e5edf5", background: "#ffffff" }}
        >
          <div>
            <div className="text-[11px] uppercase" style={{ color: "#533afd", letterSpacing: "0.05em", fontWeight: 500 }}>
              {def.singular}
            </div>
            <h2
              className="mt-1"
              style={{ color: "#061b31", fontSize: 20, fontWeight: 300, letterSpacing: "-0.2px" }}
            >
              {isCreate ? `New ${def.singular}` : (values.label as string) || (values.name as string) || "Edit"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5"
            style={{ color: "#64748d", borderRadius: 4 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f9fc")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto px-6 py-5"
          style={{ background: "#f6f9fc" }}
        >
          {error && (
            <div
              className="flex items-start gap-2 px-3 py-2 text-[13px] mb-4"
              style={{
                background: "rgba(229,72,77,0.08)",
                color: "#b03238",
                border: "1px solid rgba(229,72,77,0.30)",
                borderRadius: 4,
              }}
            >
              <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <div
            className="p-5"
            style={{
              background: "#ffffff",
              border: "1px solid #e5edf5",
              borderRadius: 6,
              boxShadow: "rgba(23,23,23,0.06) 0px 3px 6px",
            }}
          >
            <div className="grid grid-cols-1 gap-4">
              {def.fields.map((field) => {
                if (!isCreate && field.immutable) {
                  return (
                    <ReadOnlyField key={field.key} field={field} value={values[field.key]} />
                  );
                }
                return (
                  <FieldRenderer
                    key={field.key}
                    field={field}
                    value={values[field.key]}
                    onChange={(v) => setField(field.key, v)}
                  />
                );
              })}
            </div>
          </div>

          {!isCreate && (
            <div style={{ marginTop: 16 }}>
              {confirmDelete ? (
                <div
                  className="p-4"
                  style={{
                    border: "1px solid rgba(229,72,77,0.30)",
                    background: "rgba(229,72,77,0.06)",
                    borderRadius: 6,
                  }}
                >
                  <div className="text-[13px] mb-3" style={{ color: "#b03238", fontWeight: 500 }}>
                    Permanently delete this {def.singular.toLowerCase()}?
                  </div>
                  <div className="text-[12px] mb-3" style={{ color: "#64748d" }}>
                    If it&apos;s referenced by existing orders, the delete will fail and you should disable instead.
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={saving}
                      className="px-3 py-1.5 text-[12px] disabled:opacity-50"
                      style={{ background: "#e5484d", color: "#ffffff", borderRadius: 4, fontWeight: 500 }}
                    >
                      Confirm Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-3 py-1.5 text-[12px]"
                      style={{
                        background: "#ffffff",
                        color: "#273951",
                        border: "1px solid #e5edf5",
                        borderRadius: 4,
                        fontWeight: 500,
                      }}
                    >
                      Keep
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px]"
                  style={{
                    background: "rgba(229,72,77,0.08)",
                    color: "#b03238",
                    border: "1px solid rgba(229,72,77,0.25)",
                    borderRadius: 4,
                    fontWeight: 500,
                  }}
                >
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-2.5 flex items-center justify-end gap-2 flex-shrink-0"
          style={{ borderTop: "1px solid #e5edf5", background: "#ffffff" }}
        >
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[12px]"
            style={{
              background: "#ffffff",
              color: "#273951",
              border: "1px solid #e5edf5",
              borderRadius: 4,
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] disabled:opacity-50"
            style={{ background: "#533afd", color: "#ffffff", borderRadius: 4, fontWeight: 500 }}
            onMouseEnter={(e) => {
              if (!saving) (e.currentTarget as HTMLButtonElement).style.background = "#4434d4";
            }}
            onMouseLeave={(e) => {
              if (!saving) (e.currentTarget as HTMLButtonElement).style.background = "#533afd";
            }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {isCreate ? `Create ${def.singular}` : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: LookupField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "boolean") {
    const on = Boolean(value);
    return (
      <div>
        <FieldLabel field={field} />
        <button
          type="button"
          onClick={() => onChange(!on)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 4,
            cursor: "pointer",
            ...(on
              ? {
                  background: "rgba(21,190,83,0.14)",
                  color: "#108c3d",
                  border: "1px solid rgba(21,190,83,0.30)",
                }
              : {
                  background: "#ffffff",
                  color: "#64748d",
                  border: "1px solid #e5edf5",
                }),
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: on ? "#108c3d" : "#94a3b8",
            }}
          />
          {on ? "On" : "Off"}
        </button>
        {field.helper && (
          <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>{field.helper}</div>
        )}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        <FieldLabel field={field} />
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 text-[13px] outline-none"
          style={{
            border: "1px solid #e5edf5",
            color: "#061b31",
            background: "#ffffff",
            borderRadius: 4,
            appearance: "none",
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 4l3 3 3-3' fill='none' stroke='%2364748d' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 10px center",
            paddingRight: 32,
          }}
        >
          <option value="">— Select —</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {field.helper && (
          <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>{field.helper}</div>
        )}
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div>
        <FieldLabel field={field} />
        <input
          type="number"
          value={value === null || value === undefined ? "" : (value as number)}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") onChange(null);
            else {
              const n = Number(v);
              onChange(Number.isFinite(n) ? n : null);
            }
          }}
          className="w-full px-3 py-2 text-[13px] outline-none"
          style={{
            border: "1px solid #e5edf5",
            color: "#061b31",
            background: "#ffffff",
            borderRadius: 4,
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "#533afd")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "#e5edf5")}
        />
        {field.helper && (
          <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>{field.helper}</div>
        )}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        <FieldLabel field={field} />
        <textarea
          rows={3}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 text-[13px] outline-none"
          style={{
            border: "1px solid #e5edf5",
            color: "#061b31",
            background: "#ffffff",
            borderRadius: 4,
            resize: "vertical",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "#533afd")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "#e5edf5")}
        />
        {field.helper && (
          <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>{field.helper}</div>
        )}
      </div>
    );
  }

  // text
  return (
    <div>
      <FieldLabel field={field} />
      <input
        type="text"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(field.uppercase ? e.target.value.toUpperCase() : e.target.value)}
        placeholder={field.placeholder}
        className="w-full px-3 py-2 text-[13px] outline-none"
        style={{
          border: "1px solid #e5edf5",
          color: "#061b31",
          background: "#ffffff",
          borderRadius: 4,
          fontFamily: field.uppercase
            ? "SourceCodePro, ui-monospace, SFMono-Regular, monospace"
            : undefined,
          letterSpacing: field.uppercase ? "0.02em" : undefined,
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "#533afd")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "#e5edf5")}
      />
      {field.helper && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>{field.helper}</div>
      )}
    </div>
  );
}

function ReadOnlyField({ field, value }: { field: LookupField; value: unknown }) {
  return (
    <div>
      <FieldLabel field={field} />
      <div
        className="w-full px-3 py-2 text-[13px]"
        style={{
          border: "1px solid #e5edf5",
          background: "#f6f9fc",
          color: "#64748d",
          borderRadius: 4,
          fontFamily: field.uppercase ? "SourceCodePro, ui-monospace, SFMono-Regular, monospace" : undefined,
        }}
      >
        {(value as string) || "—"}
      </div>
      {field.helper && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>{field.helper}</div>
      )}
    </div>
  );
}

function FieldLabel({ field }: { field: LookupField }) {
  return (
    <div className="mb-1.5 text-[12px]" style={{ color: "#273951", fontWeight: 500 }}>
      {field.label}
      {field.required && <span style={{ color: "#e5484d" }}> *</span>}
    </div>
  );
}
