// Shared primitives for the admin tables (Tracker, Inventory, future Configuration
// expansions). Lives in one place so a style nudge or a11y fix lands in every
// table at once instead of drifting between page-local copies.

import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";

// Sortable table header. Generic over the sort key so each consumer can keep
// its own union of sortable columns without `as any` casts.
export function Th<K extends string>({
  children,
  sortKey,
  sort,
  onSort,
  right,
}: {
  children?: React.ReactNode;
  sortKey?: K;
  sort?: { key: K; dir: "asc" | "desc" };
  onSort?: (key: K) => void;
  right?: boolean;
}) {
  const sortable = !!sortKey && !!onSort;
  const active = sortable && sort?.key === sortKey;
  const Icon = active ? (sort?.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      onClick={sortable ? () => onSort!(sortKey!) : undefined}
      style={{
        textAlign: right ? "right" : "left",
        padding: "10px 12px",
        fontSize: 11,
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: active ? "#4434d4" : "#64748d",
        whiteSpace: "nowrap",
        cursor: sortable ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {children}
        {sortable && <Icon size={11} style={{ opacity: active ? 1 : 0.4 }} />}
      </span>
    </th>
  );
}

// Basic table cell with optional right-alignment.
export function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td
      style={{
        padding: "10px 12px",
        verticalAlign: "middle",
        overflow: "hidden",
        textAlign: right ? "right" : "left",
      }}
    >
      {children}
    </td>
  );
}

// Subdued placeholder text — used for empty fields ("—", "Unassigned", etc.).
export function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#94a3b8" }}>{children}</span>;
}

// Inline status pill. Callers pass either a `label` (text-only) or `children`
// (icon + text) — keeps the Tracker's simple stage pill and the Account
// page's icon-prefixed status pill on the same primitive.
export function Pill({
  label,
  bg,
  color,
  children,
}: {
  label?: string;
  bg: string;
  color: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: children ? 4 : 0,
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 500,
        padding: "1px 6px",
        borderRadius: 4,
        border: `1px solid ${hexWithAlpha(color, 0.25)}`,
        whiteSpace: "nowrap",
      }}
    >
      {children ?? label}
    </span>
  );
}

// Search-with-icon input. Same shape used in Tracker and Inventory toolbars.
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        background: "#fff",
        border: "1px solid #e5edf5",
        borderRadius: 4,
        flex: 1,
        minWidth: 240,
        maxWidth: 360,
      }}
    >
      <Search size={14} style={{ color: "#94a3b8", flexShrink: 0 }} />
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
  );
}

// Color helper used by Pill borders; lifted out of TrackerClient so the
// primitive doesn't import from a page module.
export function hexWithAlpha(color: string, alpha: number): string {
  if (color.startsWith("rgba")) return color;
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `,${alpha})`);
  }
  const hex = color.replace("#", "");
  if (hex.length !== 6) return color;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
