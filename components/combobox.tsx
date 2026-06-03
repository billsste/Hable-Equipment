"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

// Search-as-you-type combobox. Replaces native <select> per CLAUDE.md §6.3 for
// any dropdown with more than 5 options. Built on the same pattern the
// Tracker's FilterSelect already uses (popover + filtered list + keyboard nav)
// so visual + interaction parity is automatic.
//
// Implementation note: built from scratch (no cmdk dep) because cmdk is fine
// but adds another shadow DOM layer and ARIA wrapper that this small surface
// area doesn't need. The keyboard model (↑/↓ to move, Enter to select, Esc to
// close) and substring-anywhere case-insensitive filter are the only
// guarantees the workspace standard requires.
export type ComboboxOption = { value: string; label: string };

export function Combobox({
  value,
  onChange,
  placeholder,
  options,
  clearable = true,
  width = 200,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: ComboboxOption[];
  /** When true, an empty `value` is shown as the placeholder and a clear (×) button appears once a value is selected. */
  clearable?: boolean;
  width?: number | string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const active = value !== "";
  const selectedLabel = active ? options.find((o) => o.value === value)?.label ?? "" : "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Empty query (or query that still equals the currently-selected label)
    // shows the full list — otherwise the user can't see siblings of the
    // value they're trying to change.
    if (!q || q === selectedLabel.toLowerCase()) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [query, options, selectedLabel]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  function commit(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", width }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px 6px 10px",
          fontSize: 13,
          background: active ? "rgba(83,58,253,0.08)" : "#ffffff",
          color: active ? "#4434d4" : "#273951",
          border: `1px solid ${active ? "rgba(83,58,253,0.20)" : "#e5edf5"}`,
          borderRadius: 4,
          cursor: "text",
        }}
        onClick={() => {
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        <input
          ref={inputRef}
          value={open ? query : selectedLabel}
          placeholder={placeholder}
          onFocus={(e) => {
            // Pre-fill the query with the current selection so reopening
            // shows what's already chosen (and the full list of siblings
            // via the selectedLabel passthrough in the filter). Selecting
            // the text means typing replaces it cleanly.
            setQuery(selectedLabel);
            setOpen(true);
            e.target.select();
          }}
          // Clicking an already-focused input doesn't re-fire onFocus, so the
          // popover wouldn't reopen after the first selection. Mirror the
          // focus behavior on click so a second click always reopens cleanly.
          onClick={(e) => {
            setQuery(selectedLabel);
            setOpen(true);
            (e.currentTarget as HTMLInputElement).select();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(filtered.length - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const opt = filtered[highlight];
              if (opt) commit(opt.value);
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
              inputRef.current?.blur();
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            outline: "none",
            background: "transparent",
            border: 0,
            color: "inherit",
            fontSize: 13,
          }}
        />
        {active && clearable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              commit("");
            }}
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4434d4",
              background: "transparent",
              border: 0,
              padding: 0,
              cursor: "pointer",
            }}
            title="Clear"
          >
            <X size={12} />
          </button>
        ) : (
          <ChevronDown size={12} style={{ flexShrink: 0, color: "#94a3b8" }} />
        )}
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 20,
            background: "#ffffff",
            border: "1px solid #e5edf5",
            borderRadius: 4,
            boxShadow: "rgba(23,23,23,0.12) 0px 6px 16px",
            maxHeight: 240,
            overflowY: "auto",
            padding: 4,
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: "8px 10px", fontSize: 12, color: "#94a3b8" }}>No matches</div>
          ) : (
            filtered.map((o, i) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(o.value);
                }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  fontSize: 13,
                  borderRadius: 3,
                  background: i === highlight ? "rgba(83,58,253,0.08)" : "transparent",
                  color: i === highlight ? "#4434d4" : "#273951",
                  border: 0,
                  cursor: "pointer",
                }}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
