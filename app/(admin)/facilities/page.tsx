"use client";

import { useState, useEffect } from "react";
import { Building2, Plus, Edit2, X, Loader2, ToggleLeft, ToggleRight } from "lucide-react";

type Facility = { id: number; name: string; initials: string; active: boolean };

export default function FacilitiesPage() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editFacility, setEditFacility] = useState<Facility | null>(null);

  useEffect(() => { loadFacilities(); }, []);

  async function loadFacilities() {
    setLoading(true);
    const res = await fetch("/api/facilities");
    const d = await res.json();
    setFacilities(d.facilities ?? []);
    setLoading(false);
  }

  async function toggleActive(f: Facility) {
    await fetch(`/api/facilities/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !f.active }),
    });
    loadFacilities();
  }

  const active = facilities.filter((f) => f.active);
  const inactive = facilities.filter((f) => !f.active);

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: "#1a1d26" }}>
            <Building2 size={20} /> Facilities
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "#5a6070" }}>
            {active.length} active &bull; {inactive.length} disabled
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg"
          style={{ background: "#2563eb" }}
        >
          <Plus size={14} /> Add Facility
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: "#2563eb" }} />
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e5ea" }}>
                {["Code", "Facility Name", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "#8c92a4" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facilities.map((f) => (
                <tr key={f.id} style={{ borderBottom: "1px solid #eef0f3" }}>
                  <td className="px-5 py-3.5">
                    <span
                      className="text-xs font-bold px-2 py-1 rounded-md"
                      style={{ background: "#eff4ff", color: "#2563eb" }}
                    >
                      {f.initials}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm font-medium" style={{ color: "#1a1d26" }}>{f.name}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={
                        f.active
                          ? { background: "#f0fdf4", color: "#16a34a" }
                          : { background: "#f3f4f6", color: "#8c92a4" }
                      }
                    >
                      {f.active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleActive(f)}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                        style={
                          f.active
                            ? { background: "#fef2f2", color: "#dc2626" }
                            : { background: "#f0fdf4", color: "#16a34a" }
                        }
                      >
                        {f.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        {f.active ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => setEditFacility(f)}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium"
                        style={{ background: "#f3f4f6", color: "#5a6070" }}
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showAdd || editFacility) && (
        <FacilityModal
          facility={editFacility}
          onClose={() => { setShowAdd(false); setEditFacility(null); }}
          onSaved={() => { loadFacilities(); setShowAdd(false); setEditFacility(null); }}
        />
      )}
    </div>
  );
}

function FacilityModal({
  facility,
  onClose,
  onSaved,
}: {
  facility: Facility | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!facility;
  const [name, setName] = useState(facility?.name ?? "");
  const [initials, setInitials] = useState(facility?.initials ?? "");
  const [active, setActive] = useState(facility?.active ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !initials) { setError("Name and initials required"); return; }
    setError("");
    setLoading(true);
    if (isEdit) {
      await fetch(`/api/facilities/${facility!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, initials, active }),
      });
    } else {
      await fetch("/api/facilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, initials, active }),
      });
    }
    setLoading(false);
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl w-full max-w-sm p-6" style={{ boxShadow: "0 4px 16px rgba(0,0,0,.12)" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold" style={{ color: "#1a1d26" }}>
            {isEdit ? "Edit Facility" : "Add Facility"}
          </h2>
          <button onClick={onClose}><X size={18} style={{ color: "#8c92a4" }} /></button>
        </div>
        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg text-sm" style={{ background: "#fef2f2", color: "#dc2626" }}>{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#1a1d26" }}>Facility Name</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ border: "1px solid #e2e5ea" }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#1a1d26" }}>Code / Initials</label>
            <input
              type="text" value={initials} onChange={(e) => setInitials(e.target.value.toUpperCase())} required
              maxLength={6}
              className="w-full px-3 py-2 text-sm rounded-lg outline-none font-mono uppercase"
              style={{ border: "1px solid #e2e5ea" }}
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              className="relative w-10 h-6 rounded-full transition-colors"
              style={{ background: active ? "#2563eb" : "#d1d5db" }}
              onClick={() => setActive(!active)}
            >
              <div
                className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform"
                style={{ left: active ? "22px" : "4px" }}
              />
            </div>
            <span className="text-sm" style={{ color: "#1a1d26" }}>Active</span>
          </label>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 text-sm rounded-lg font-medium"
              style={{ background: "#f3f4f6", color: "#5a6070" }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2 text-sm rounded-lg font-medium text-white disabled:opacity-60"
              style={{ background: "#2563eb" }}>
              {loading && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
