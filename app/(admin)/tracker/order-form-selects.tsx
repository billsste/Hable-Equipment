"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { AUTH_LABELS, AUTH_NEXT, type OrderShape } from "@/lib/order-types";
import { Label, usePopoverList } from "./order-form-atoms";

export function UserSelect({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  options: Array<{ id: number; name: string }>;
  required?: boolean;
}) {
  return (
    <SearchSelect
      label={label}
      required={required}
      value={value === null ? null : String(value)}
      onChange={(v) => onChange(v === null ? null : Number(v))}
      placeholder="Search…"
      emptyLabel="— Select —"
      options={options.map((o) => ({ value: String(o.id), label: o.name }))}
    />
  );
}

export function FacilitySelect({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  options: Array<{ id: number; name: string; initials: string }>;
  required?: boolean;
}) {
  return (
    <SearchSelect
      label={label}
      required={required}
      value={value === null ? null : String(value)}
      onChange={(v) => onChange(v === null ? null : Number(v))}
      placeholder="Search facilities…"
      hintPosition="left"
      options={options.map((o) => ({
        value: String(o.id),
        label: o.name,
        hint: o.initials || undefined,
      }))}
    />
  );
}

export function InsuranceSelect({
  label,
  value,
  onChange,
  options,
  optional,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: Array<{ key: string; label: string; coverageType: string | null; accepted: boolean }>;
  optional?: boolean;
}) {
  return (
    <SearchSelect
      label={label}
      optional={optional}
      value={value}
      onChange={onChange}
      placeholder="Search insurance…"
      emptyLabel="— None —"
      options={options.map((o) => ({
        value: o.key,
        label: o.label,
        hint: [o.coverageType, !o.accepted ? "not accepted" : null].filter(Boolean).join(" · ") || undefined,
      }))}
    />
  );
}

export function SearchSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  required,
  optional,
  hintPosition = "right",
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: Array<{ value: string; label: string; hint?: string }>;
  placeholder?: string;
  emptyLabel?: string;
  required?: boolean;
  optional?: boolean;
  hintPosition?: "left" | "right";
}) {
  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);
  const selectedLabel = selected?.label ?? "";
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q === selectedLabel.toLowerCase()) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query, selectedLabel]);

  function commit(opt: { value: string; label: string }) {
    onChange(opt.value);
    setQuery("");
    setOpen(false);
  }

  const {
    open, setOpen, highlight, setHighlight,
    containerRef, popoverRef, inputRef, anchorRect, onKeyDown,
  } = usePopoverList({
    itemCount: matches.length,
    onPick: (i) => commit(matches[i]),
    pickRequiresOpen: true,
  });

  function clear() {
    onChange(null);
    setQuery("");
    setOpen(true);
    inputRef.current?.focus();
  }

  const display = open ? query : selectedLabel;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <Label required={required}>
        {label}
        {optional ? <span style={{ color: "#64748d", fontWeight: 400 }}> (optional)</span> : null}
      </Label>
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder ?? "Search…"}
          value={display}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={(e) => {
            setQuery(selectedLabel);
            setOpen(true);
            e.target.select();
          }}
          onKeyDown={onKeyDown}
          autoComplete="off"
          className="w-full px-3 py-2 text-[13px] outline-none"
          style={{
            border: "1px solid #e5edf5",
            color: "#061b31",
            background: "#ffffff",
            borderRadius: 4,
            paddingRight: selected ? 32 : 12,
          }}
        />
        {selected && (
          <button
            type="button"
            onClick={clear}
            title="Clear selection"
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              width: 22,
              height: 22,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              color: "#94a3b8",
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open && anchorRect && (
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            left: anchorRect.left,
            top: anchorRect.bottom + 4,
            width: anchorRect.width,
            background: "#ffffff",
            border: "1px solid #e5edf5",
            borderRadius: 4,
            boxShadow: "rgba(50,50,93,0.12) 0px 8px 24px, rgba(0,0,0,0.06) 0px 3px 8px",
            maxHeight: 260,
            overflowY: "auto",
            zIndex: 60,
          }}
        >
          {emptyLabel && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(null);
                setQuery("");
                setOpen(false);
              }}
              style={{
                padding: "8px 12px",
                fontSize: 13,
                cursor: "pointer",
                color: "#64748d",
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              {emptyLabel}
            </div>
          )}
          {matches.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "#64748d" }}>
              No matches.
            </div>
          ) : (
            matches.map((o, i) => {
              const active = i === highlight;
              return (
                <div
                  key={o.value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(o);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    cursor: "pointer",
                    background: active ? "#f6f9fc" : "#ffffff",
                    color: "#061b31",
                    borderBottom: "1px solid #f1f5f9",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {o.hint && hintPosition === "left" && (
                    <span style={{ fontSize: 13, color: "#64748d", fontWeight: 500 }}>{o.hint}</span>
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>{o.label}</span>
                  {o.hint && hintPosition === "right" && (
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>{o.hint}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function SegmentedSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const activeStyle = {
    background: "rgba(83,58,253,0.08)",
    color: "#4434d4",
    border: "1px solid rgba(83,58,253,0.20)",
    borderRadius: 4,
    fontWeight: 500,
  };
  const inactiveStyle = {
    background: "#ffffff",
    color: "#64748d",
    border: "1px solid #e5edf5",
    borderRadius: 4,
    fontWeight: 500,
  };
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => onChange(null)}
          className="px-3 py-1.5 text-[12px]"
          style={value === null ? activeStyle : inactiveStyle}
        >
          —
        </button>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="px-3 py-1.5 text-[12px]"
            style={value === o.value ? activeStyle : inactiveStyle}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AuthStatusSelect({
  value,
  from,
  onChange,
}: {
  value: OrderShape["authStatus"];
  from: OrderShape["authStatus"];
  onChange: (v: OrderShape["authStatus"]) => void;
}) {
  const keys: Array<OrderShape["authStatus"]> = [from, ...AUTH_NEXT[from]];
  return (
    <SearchSelect
      label="Authorization Status"
      value={value}
      onChange={(v) => onChange((v ?? from) as OrderShape["authStatus"])}
      placeholder="Search…"
      options={keys.map((k) => ({ value: k, label: AUTH_LABELS[k] }))}
    />
  );
}

export function ChipMulti({
  options,
  value,
  onToggle,
  placeholder,
}: {
  options: Array<{ key: string; label: string }>;
  value: string[];
  onToggle: (key: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((o) => {
      if (value.includes(o.key)) return false;
      if (!q) return true;
      return o.label.toLowerCase().includes(q);
    });
  }, [options, query, value]);

  const {
    open, setOpen, highlight, setHighlight,
    containerRef, popoverRef, inputRef, anchorRect,
    onKeyDown: hookKeyDown,
  } = usePopoverList({
    itemCount: matches.length,
    onPick: (i) => pick(matches[i].key),
  });

  function pick(key: string) {
    onToggle(key);
    setQuery("");
    setHighlight(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && query === "" && value.length > 0) {
      onToggle(value[value.length - 1]);
      return;
    }
    hookKeyDown(e);
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((k) => {
            const opt = options.find((o) => o.key === k);
            const label = opt?.label ?? k;
            return (
              <span
                key={k}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: "rgba(83,58,253,0.08)",
                  color: "#4434d4",
                  border: "1px solid rgba(83,58,253,0.20)",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 500,
                  height: 26,
                  paddingLeft: 8,
                }}
              >
                <span>{label}</span>
                <button
                  type="button"
                  onClick={() => onToggle(k)}
                  title="Remove"
                  style={{
                    marginLeft: 2,
                    marginRight: 2,
                    width: 22,
                    height: 22,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#94a3b8",
                    borderRadius: 3,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#4434d4";
                    e.currentTarget.style.background = "rgba(83,58,253,0.10)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#94a3b8";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? "Search to add…"}
        className="w-full px-3 py-2 text-[13px] outline-none"
        style={{
          border: "1px solid #e5edf5",
          color: "#061b31",
          background: "#ffffff",
          borderRadius: 4,
        }}
      />
      {open && anchorRect && (
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            left: anchorRect.left,
            top: anchorRect.bottom + 4,
            width: anchorRect.width,
            background: "#ffffff",
            border: "1px solid #e5edf5",
            borderRadius: 4,
            boxShadow: "rgba(50,50,93,0.12) 0px 8px 24px, rgba(0,0,0,0.06) 0px 3px 8px",
            maxHeight: 240,
            overflowY: "auto",
            zIndex: 60,
          }}
        >
          {matches.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "#64748d" }}>
              {value.length === options.length ? "All options selected." : "No matches."}
            </div>
          ) : (
            matches.map((o, i) => {
              const active = i === highlight;
              return (
                <div
                  key={o.key}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o.key);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    cursor: "pointer",
                    background: active ? "#f6f9fc" : "#ffffff",
                    color: "#061b31",
                    borderBottom: "1px solid #f1f5f9",
                  }}
                >
                  {o.label}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
