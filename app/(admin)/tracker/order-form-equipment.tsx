"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { usePopoverList } from "./order-form-atoms";
import type { Lookups } from "./TrackerClient";

export function EquipmentPicker({
  equipment,
  value,
  onChange,
}: {
  equipment: Lookups["equipment"];
  value: Array<{ equipmentId: string; quantity: number }>;
  onChange: (v: Array<{ equipmentId: string; quantity: number }>) => void;
}) {
  const [search, setSearch] = useState("");

  const matches = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return equipment.slice(0, 40);
    return equipment
      .filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.abbreviation.toLowerCase().includes(q) ||
          e.hcpcsCode.toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [equipment, search]);

  const {
    open, setOpen, highlight, setHighlight,
    containerRef, popoverRef, inputRef, anchorRect, onKeyDown,
  } = usePopoverList({
    itemCount: matches.length,
    onPick: (i) => addById(matches[i].id),
  });

  function setQty(equipmentId: string, qty: number) {
    if (qty <= 0) {
      onChange(value.filter((it) => it.equipmentId !== equipmentId));
    } else if (value.some((it) => it.equipmentId === equipmentId)) {
      onChange(value.map((it) => (it.equipmentId === equipmentId ? { ...it, quantity: qty } : it)));
    } else {
      onChange([...value, { equipmentId, quantity: qty }]);
    }
  }

  function addById(equipmentId: string) {
    const existing = value.find((it) => it.equipmentId === equipmentId);
    setQty(equipmentId, (existing?.quantity ?? 0) + 1);
    setSearch("");
    setHighlight(0);
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search equipment by name, abbreviation, or HCPCS…"
          className="w-full px-3 py-2 text-[13px] outline-none"
          style={{
            border: "1px solid #e5edf5",
            color: "#061b31",
            background: "#ffffff",
            borderRadius: 4,
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            background: "#ffffff",
            border: "1px solid #e5edf5",
            borderRadius: 4,
            padding: value.length === 0 ? "10px 12px" : 6,
            minHeight: 40,
          }}
        >
          {value.length === 0 ? (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>No equipment added yet.</div>
          ) : (
            value.map((it) => {
              const eq = equipment.find((e) => e.id === it.equipmentId);
              if (!eq) return null;
              const meta = [eq.abbreviation, eq.hcpcsCode].filter(Boolean).join(" · ");
              return (
                <div
                  key={it.equipmentId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    background: "#f6f9fc",
                    borderRadius: 4,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "#061b31",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {eq.name}
                    </div>
                    {meta && (
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>{meta}</div>
                    )}
                  </div>
                  <input
                    id={`qty-${it.equipmentId}`}
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      setQty(it.equipmentId, Math.max(1, Math.floor(n)));
                    }}
                    title="Quantity"
                    style={{
                      width: 48,
                      height: 26,
                      fontSize: 12,
                      fontWeight: 500,
                      padding: "0 6px",
                      color: "#061b31",
                      background: "#ffffff",
                      border: "1px solid #e5edf5",
                      borderRadius: 4,
                      textAlign: "center",
                      outline: "none",
                      fontFeatureSettings: '"tnum"',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#533afd")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#e5edf5")}
                  />
                  <button
                    type="button"
                    onClick={() => setQty(it.equipmentId, 0)}
                    title="Remove"
                    style={{
                      flexShrink: 0,
                      width: 24,
                      height: 24,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#94a3b8",
                      borderRadius: 4,
                      background: "transparent",
                      border: 0,
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#b03238";
                      e.currentTarget.style.background = "rgba(229,72,77,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "#94a3b8";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Dropdown */}
      {open && anchorRect && (
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: anchorRect.bottom + 4,
            left: anchorRect.left,
            width: anchorRect.width,
            background: "#ffffff",
            border: "1px solid #e5edf5",
            borderRadius: 4,
            boxShadow: "rgba(50,50,93,0.12) 0px 6px 16px",
            maxHeight: 280,
            overflowY: "auto",
            zIndex: 60,
          }}
        >
          {matches.length === 0 ? (
            <div className="text-[13px] py-6 text-center" style={{ color: "#94a3b8" }}>
              No matches.
            </div>
          ) : (
            matches.map((e, i) => {
              const isHighlighted = i === highlight;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => addById(e.id)}
                  onMouseEnter={() => setHighlight(i)}
                  className="w-full text-left px-3 py-2"
                  style={{
                    background: isHighlighted ? "#f6f9fc" : "#ffffff",
                    borderBottom: "1px solid #e5edf5",
                    fontSize: 13,
                    color: "#061b31",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {e.name}
                    {e.abbreviation && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: "#94a3b8" }}>{e.abbreviation}</span>
                    )}
                  </span>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{e.category}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
