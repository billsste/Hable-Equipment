"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { OrderShape } from "@/lib/order-types";
import { formatDateShort } from "@/lib/utils";
import { Combobox } from "@/components/combobox";
export { Label } from "@/components/form-primitives";
import { Label } from "@/components/form-primitives";

export function useAnchorRect(ref: React.RefObject<HTMLElement | null>, open: boolean) {
  const [rect, setRect] = useState<{ left: number; top: number; bottom: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    let raf: number | null = null;
    function read() {
      raf = null;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const next = { left: r.left, top: r.top, bottom: r.bottom, width: r.width };
      setRect((prev) =>
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.bottom === next.bottom &&
        prev.width === next.width
          ? prev
          : next,
      );
    }
    function schedule() {
      if (raf !== null) return;
      raf = requestAnimationFrame(read);
    }
    read();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [open, ref]);
  return rect;
}

export function usePopoverList({
  itemCount,
  onPick,
  pickRequiresOpen = false,
}: {
  itemCount: number;
  onPick: (index: number) => void;
  pickRequiresOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const anchorRect = useAnchorRect(inputRef, open);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): boolean {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(itemCount - 1, h + 1));
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
      return true;
    }
    if (e.key === "Enter") {
      if (pickRequiresOpen && !open) return false;
      if (highlight >= 0 && highlight < itemCount) {
        e.preventDefault();
        onPick(highlight);
        return true;
      }
      return false;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return true;
    }
    return false;
  }

  return {
    open,
    setOpen,
    highlight,
    setHighlight,
    containerRef,
    popoverRef,
    inputRef,
    anchorRect,
    onKeyDown,
  };
}

export const STEPPER_STEPS: Array<{ n: 1 | 2 | 3; label: string }> = [
  { n: 1, label: "Initial Intake" },
  { n: 2, label: "Verification" },
  { n: 3, label: "Fulfillment & Dispatch" },
];

export function Stepper({ step, onChange }: { step: number; onChange: (n: number) => void }) {
  return (
    <div
      style={{
        flexShrink: 0,
        background: "#f6f9fc",
        borderBottom: "1px solid #e5edf5",
        padding: "8px 20px",
      }}
    >
      <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
        {STEPPER_STEPS.map((s) => (
          <button
            key={s.n}
            type="button"
            onClick={() => onChange(s.n)}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: s.n <= step ? "#533afd" : "#e5edf5",
              transition: "background-color 0.2s",
              padding: 0,
              border: 0,
              cursor: "pointer",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {STEPPER_STEPS.map((s) => {
          const active = s.n === step;
          return (
            <button
              key={s.n}
              type="button"
              onClick={() => onChange(s.n)}
              style={{
                flex: 1,
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                color: active ? "#533afd" : "#94a3b8",
                background: "transparent",
                border: 0,
                padding: "2px 0",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-4"
      style={{
        background: "#ffffff",
        border: "1px solid #e5edf5",
        borderRadius: 6,
        boxShadow: "rgba(23,23,23,0.06) 0px 3px 6px",
      }}
    >
      <div className="mb-2">
        <div
          className="text-[11px] uppercase"
          style={{ color: "#533afd", letterSpacing: "0.05em", fontWeight: 500 }}
        >
          {title}
        </div>
        {subtitle ? (
          <div className="text-[13px] mt-0.5" style={{ color: "#64748d" }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
  inputMode,
  placeholder,
  prefix,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  // Per workspace rule: never use type="number" spinners. For numeric entry keep
  // type="text" and set inputMode to surface the right mobile keypad.
  inputMode?: "numeric" | "decimal";
  placeholder?: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {prefix && (
          <span style={{ position: "absolute", left: 10, fontSize: 13, color: "#94a3b8", pointerEvents: "none" }}>
            {prefix}
          </span>
        )}
        <input
          type={type}
          inputMode={inputMode}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 text-[13px] outline-none"
          style={{
            border: "1px solid #e5edf5",
            color: "#061b31",
            background: "#ffffff",
            borderRadius: 4,
            paddingLeft: prefix ? 22 : undefined,
            paddingRight: suffix ? 26 : undefined,
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "#533afd")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "#e5edf5")}
        />
        {suffix && (
          <span style={{ position: "absolute", right: 10, fontSize: 13, color: "#94a3b8", pointerEvents: "none" }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export function NotesThread({
  order,
  draft,
  onDraftChange,
}: {
  order: OrderShape | null;
  draft: string;
  onDraftChange: (s: string) => void;
}) {
  // Memoize so re-renders driven by the draft textarea don't re-filter+sort
  // history on every keystroke.
  const past = useMemo(() => {
    const eventNotes = (order?.history ?? [])
      .filter((e) => e.action === "Note added" || e.action === "Notes added")
      .map((e) => ({ id: e.id, who: e.who, ts: e.ts, text: e.detail }));
    // Pre-thread orders have a single notes string but no event row — surface
    // it as a synthesized entry so legacy notes don't disappear.
    const list =
      order && order.notes && eventNotes.length === 0
        ? [{ id: `legacy-${order.id}`, who: "system", ts: order.createdAt, text: order.notes }, ...eventNotes]
        : eventNotes;
    return [...list].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [order?.history, order?.id, order?.notes, order?.createdAt]);

  const draftId = order?.id ?? "new";

  return (
    <div className="space-y-2">
      {past.length > 0 && (
        <div className="space-y-1.5">
          {past.map((n) => (
            <div
              key={n.id}
              className="px-3 py-2 text-[13px]"
              style={{
                background: "#f6f9fc",
                border: "1px solid #e5edf5",
                borderRadius: 4,
              }}
            >
              <div
                style={{
                  color: "#061b31",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {n.text}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: "#94a3b8" }}>
                <span>{n.who}</span>
                <span>·</span>
                <span style={{ fontFeatureSettings: '"tnum"' }}>{formatDateShort(n.ts)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <textarea
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        rows={3}
        placeholder={past.length > 0 ? "Add another note…" : "Add a note (visible to all staff)…"}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        data-form-type="other"
        name={`order-note-draft-${draftId}`}
        className="w-full px-3 py-2 text-[13px] outline-none"
        style={{
          border: "1px solid #e5edf5",
          color: "#061b31",
          resize: "vertical",
          background: "#ffffff",
          borderRadius: 4,
        }}
      />
    </div>
  );
}

export function HistoryReadonly({ order }: { order: OrderShape }) {
  // Show every event written for the order — the History tab is the
  // per-order audit feed (lifecycle + field edits + notes + items + auth).
  // The system-wide Audit Log page is the cross-order view; this is the
  // single-order view. Each row carries action + detail so the reader can
  // see exactly what changed.
  const allEvents = useMemo(
    () =>
      (order.history ?? [])
        .slice()
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()),
    [order.history],
  );

  // Distinct action types in this order's history — feeds the single
  // catch-all filter dropdown. Each option carries its count so the
  // dropdown reads "Door tag (5)" / "Status changed (3)" etc.
  const actionOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of allEvents) m.set(e.action, (m.get(e.action) ?? 0) + 1);
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([action, count]) => ({ value: action, label: `${action} (${count})` }));
  }, [allEvents]);

  // "" = show everything. Combobox is the catch-all — same shared picker
  // used by the Tracker filter row, so the UX is consistent.
  const [actionFilter, setActionFilter] = useState<string>("");
  const events = useMemo(
    () => (actionFilter ? allEvents.filter((e) => e.action === actionFilter) : allEvents),
    [allEvents, actionFilter],
  );

  if (allEvents.length === 0) {
    return (
      <div
        className="px-3 py-3 text-[12px]"
        style={{
          background: "#f6f9fc",
          border: "1px solid #e5edf5",
          color: "#94a3b8",
          borderRadius: 4,
        }}
      >
        No history yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Catch-all filter — only renders when ≥2 distinct actions exist.
          Type-ahead Combobox so the user can scan or search the list. */}
      {actionOptions.length > 1 && (
        <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
          <Combobox
            value={actionFilter}
            onChange={setActionFilter}
            placeholder={`All events (${allEvents.length})`}
            options={actionOptions}
            width={260}
          />
          <span style={{ fontSize: 11, color: "#94a3b8", fontFeatureSettings: '"tnum"' }}>
            {events.length === allEvents.length ? `${allEvents.length} total` : `${events.length} of ${allEvents.length}`}
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        {events.length === 0 ? (
          <div
            className="px-3 py-3 text-[12px]"
            style={{
              background: "#f6f9fc",
              border: "1px solid #e5edf5",
              color: "#94a3b8",
              borderRadius: 4,
            }}
          >
            No matching events.
          </div>
        ) : (
          events.map((e) => (
            <div
              key={e.id}
              className="flex items-start justify-between gap-3 px-3 py-2 text-[13px]"
              style={{
                background: "#f6f9fc",
                border: "1px solid #e5edf5",
                color: "#061b31",
                borderRadius: 4,
              }}
            >
              <span className="flex flex-col min-w-0">
                <span className="truncate" style={{ fontWeight: 500 }}>{e.action}</span>
                {e.detail && (
                  <span
                    className="truncate"
                    style={{ fontSize: 12, color: "#64748d", marginTop: 1 }}
                    title={e.detail}
                  >
                    {e.detail}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3 flex-shrink-0">
                <span style={{ fontSize: 11, color: "#64748d" }}>{e.who}</span>
                <span style={{ fontSize: 11, color: "#94a3b8", fontFeatureSettings: '"tnum"' }}>
                  {formatDateShort(e.ts)}
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ActionBtn({
  icon,
  label,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "primary" | "success" | "danger" | "ghost";
  onClick: () => void;
}) {
  const styles =
    tone === "success"
      ? {
          background: "rgba(21,190,83,0.12)",
          color: "#108c3d",
          border: "1px solid rgba(21,190,83,0.30)",
          borderRadius: 4,
          fontWeight: 500,
        }
      : tone === "danger"
      ? {
          background: "rgba(229,72,77,0.08)",
          color: "#b03238",
          border: "1px solid rgba(229,72,77,0.25)",
          borderRadius: 4,
          fontWeight: 500,
        }
      : tone === "ghost"
      ? {
          background: "#ffffff",
          color: "#273951",
          border: "1px solid #e5edf5",
          borderRadius: 4,
          fontWeight: 500,
        }
      : {
          background: "rgba(83,58,253,0.08)",
          color: "#4434d4",
          border: "1px solid rgba(83,58,253,0.20)",
          borderRadius: 4,
          fontWeight: 500,
        };
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px]"
      style={styles}
    >
      {icon} {label}
    </button>
  );
}

export function displayName(first: string, last: string) {
  if (!first && !last) return "";
  if (!first) return last;
  if (!last) return first;
  return `${last}, ${first}`;
}
