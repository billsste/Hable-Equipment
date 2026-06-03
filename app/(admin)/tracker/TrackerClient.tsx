"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AUTH_LABELS,
  AUTH_PICKER_VALUES,
  DELIVERY_STATUS_PICKER_VALUES,
  PENDING_DOCUMENT_OPTIONS,
  STATUS_COLORS,
  STATUS_LABELS,
  VERIFICATION_STATUS_LABELS,
  WORK_ORDER_TYPE_COLORS,
  WORK_ORDER_TYPE_LABELS,
  dcUrgency,
  isTerminalStatus,
  type OrderShape,
} from "@/lib/order-types";
import type { OutcomeStatus } from "@prisma/client";
import OrderForm from "./OrderForm";
import { Download, Plus, Printer, X } from "lucide-react";
import { Muted, Pill, SearchInput, Td, Th, hexWithAlpha, sortByLabel } from "@/components/admin-ui";
import { Combobox } from "@/components/combobox";
import { downloadCsv } from "@/lib/utils";

export type Lookups = {
  csrs: Array<{ id: number; name: string }>;
  dispatchers: Array<{ id: number; name: string }>;
  facilities: Array<{
    id: number;
    name: string;
    initials: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    phone: string | null;
    contact: string | null;
  }>;
  whatsNeeded: Array<{ key: string; label: string; color: string | null; sortOrder: number }>;
  insurance: Array<{ key: string; label: string; coverageType: string | null; accepted: boolean }>;
  companies: Array<{ key: string; label: string; color: string | null }>;
  itemTypes: Array<{ key: string; label: string; color: string | null }>;
  cancellationReasons: Array<{ key: string; label: string }>;
  equipment: Array<{
    id: string;
    category: string;
    name: string;
    abbreviation: string;
    hcpcsCode: string;
    kind: "item" | "accessory";
    parLevel: number | null;
  }>;
};

type Props = {
  currentUser: { id: number; name: string; roles: string[] };
  initialOrders: OrderShape[];
  initialView: string | null;
  initialNew: boolean;
  lookups: Lookups;
};

type ViewKey = "all" | "open" | "out" | "delivered";
type SortKey = "orderNumber" | "orderType" | "patient" | "facility" | "csr" | "driver" | "orderDate";
type SortDir = "asc" | "desc";

// Tabs key off Delivery Status — the only manual lifecycle field. Anything
// finer-grained (Auth, Pending Docs, Order Status) is reachable via the
// dropdown filters below.
const VIEWS: { key: ViewKey; label: string; description: string }[] = [
  { key: "open",      label: "Open",             description: "Anything not yet wrapped up" },
  { key: "out",       label: "Out for Delivery", description: "Driver en route" },
  { key: "delivered", label: "Delivered",        description: "Closed loop" },
  { key: "all",       label: "All",              description: "Every order" },
];

const VALID_VIEWS = new Set<ViewKey>(["all", "open", "out", "delivered"]);

// Order Date presets shown next to the date inputs. The "no filter" state is
// represented by `datePreset === "all"` (the value FilterSelect uses for its
// cleared option) — keeping it out of this list means every consumer renders
// exactly the options that appear in the dropdown, plus the "custom" sentinel
// appended once below in DATE_PRESET_OPTIONS.
type DatePreset = "all" | "7d" | "30d" | "90d" | "ytd" | "custom";

// The user picks which date column the range applies to. "orderDate" keys
// off the row's creation timestamp (matching the "Order Date" table column);
// the other three filter on the form-entered scheduling dates.
type DateField = "orderDate" | "discharge" | "requested" | "dos";
const DATE_FIELD_OPTIONS: { value: DateField; label: string }[] = [
  { value: "orderDate", label: "Order Date" },
  { value: "discharge", label: "Scheduled Discharge Date" },
  { value: "requested", label: "Requested Delivery Date" },
  { value: "dos",       label: "DOS Submitted" },
];
function pickDateForField(o: OrderShape, field: DateField): string | null {
  switch (field) {
    case "orderDate": return o.createdAt;
    case "discharge": return o.dischargeDate;
    case "requested": return o.requestedDeliveryDate;
    case "dos":       return o.dosSubmitted;
  }
}
function labelForDateField(field: DateField): string {
  return DATE_FIELD_OPTIONS.find((o) => o.value === field)?.label ?? field;
}
const DATE_PRESETS: { key: Exclude<DatePreset, "all" | "custom">; label: string }[] = [
  { key: "7d",  label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "ytd", label: "YTD" },
];
const DATE_PRESET_OPTIONS: { value: string; label: string }[] = [
  ...DATE_PRESETS.map((p) => ({ value: p.key, label: p.label })),
  { value: "custom", label: "Custom range…" },
];

// Compute the from/to ISO date range for a preset using UTC boundaries — the
// Order Date column and CSV both render createdAt in UTC (timeZone: "UTC")
// and the filter compares against createdAt.slice(0,10) which is the UTC
// date. Computing the range in local time would let a late-night order in a
// non-UTC timezone match the filter while displaying a different calendar
// date in the column. UTC everywhere keeps filter / column / CSV consistent.
function resolveDatePreset(key: DatePreset): { from: string; to: string } | null {
  if (key === "all" || key === "custom") return null;
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let from = new Date(to);
  if (key === "7d") from.setUTCDate(to.getUTCDate() - 6);
  else if (key === "30d") from.setUTCDate(to.getUTCDate() - 29);
  else if (key === "90d") from.setUTCDate(to.getUTCDate() - 89);
  else if (key === "ytd") from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return { from: toIsoDay(from), to: toIsoDay(to) };
}
function toIsoDay(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default function TrackerClient({ currentUser, initialOrders, initialView, initialNew, lookups }: Props) {
  const startView: ViewKey =
    initialView && VALID_VIEWS.has(initialView as ViewKey) ? (initialView as ViewKey) : "open";

  const [orders, setOrders] = useState<OrderShape[]>(initialOrders);
  const [view, setView] = useState<ViewKey>(startView);
  const [search, setSearch] = useState("");
  // Brent 2026-06: filter set trimmed to the four Brent asked for —
  // Authorization Status, Pending Document Actions, Order Status (verification),
  // and Delivery Status. Insurance / deductible / companies / type filters were
  // removed; reach them via search or the form if needed.
  const [authFilter, setAuthFilter] = useState("");
  const [pendingDocFilter, setPendingDocFilter] = useState("");
  const [verificationFilter, setVerificationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<OrderShape | null>(null);
  const [creating, setCreating] = useState(initialNew);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "orderDate", dir: "desc" });
  // Date range filter — applies to the date column the user picks via
  // `dateFieldFilter`. Preset "all" → no filter; "custom" → inline from/to.
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [dateFieldFilter, setDateFieldFilter] = useState<DateField>("orderDate");
  // Time-dependent row badges (auth age, DC blocker) hold until after hydration
  // so a server/client clock skew on Date.now() can't cause a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Resolve the effective from/to ISO date strings for the active preset.
  const dateRange = useMemo<{ from: string; to: string } | null>(() => {
    if (datePreset === "custom") {
      if (!dateFrom && !dateTo) return null;
      return { from: dateFrom || "1900-01-01", to: dateTo || "2999-12-31" };
    }
    return resolveDatePreset(datePreset);
  }, [datePreset, dateFrom, dateTo]);

  const filtered = useMemo(
    () =>
      sortOrders(
        filterOrders(
          orders, view, search,
          { authFilter, pendingDocFilter, verificationFilter, statusFilter, dateRange, dateField: dateFieldFilter },
        ),
        sort,
      ),
    [orders, view, search, authFilter, pendingDocFilter, verificationFilter, statusFilter, dateRange, dateFieldFilter, sort],
  );
  const hasFieldFilter =
    authFilter !== "" || pendingDocFilter !== "" || verificationFilter !== "" || statusFilter !== "" || datePreset !== "all";
  const counts = useMemo(() => {
    const m: Record<ViewKey, number> = {
      all: orders.length,
      open: 0, out: 0, delivered: 0,
    };
    for (const o of orders) {
      if (!isTerminalStatus(o.status)) m.open++;
      if (o.status === "OUT_FOR_DELIVERY") m.out++;
      if (o.status === "DELIVERED") m.delivered++;
    }
    return m;
  }, [orders]);

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  function applyOrderUpdate(updated: OrderShape) {
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      const next = prev.slice();
      next[idx] = updated;
      return next;
    });
    setEditing(null);
  }

  function applyOrderCreate(created: OrderShape) {
    setOrders((prev) => [created, ...prev]);
    setCreating(false);
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
            Tracker
          </h1>
          <p className="mt-1 text-[14px] no-print" style={{ color: "#64748d", fontWeight: 300 }}>
            Every order from initial intake through delivery.
          </p>
          {/* Print-only context line: shows on paper what filters were applied
              and how many records the list contains. Display:none on screen.
              Build a single chips array so adding a new filter requires one
              push, not another conditional fragment slipped in by hand. */}
          {(() => {
            const chips: string[] = [
              `View: ${VIEWS.find((v) => v.key === view)?.label ?? view}`,
              `${filtered.length} record${filtered.length === 1 ? "" : "s"}`,
            ];
            if (dateRange) chips.push(`${labelForDateField(dateFieldFilter)} ${dateRange.from} → ${dateRange.to}`);
            if (authFilter) chips.push(`Auth ${AUTH_LABELS[authFilter as keyof typeof AUTH_LABELS] ?? authFilter}`);
            if (pendingDocFilter) {
              const docLabel = PENDING_DOCUMENT_OPTIONS.find((d) => d.key === pendingDocFilter)?.label ?? pendingDocFilter;
              chips.push(`Pending Doc ${docLabel}`);
            }
            if (verificationFilter) chips.push(`Order Status ${VERIFICATION_STATUS_LABELS[verificationFilter as keyof typeof VERIFICATION_STATUS_LABELS]}`);
            if (statusFilter) chips.push(`Delivery ${STATUS_LABELS[statusFilter as OutcomeStatus]}`);
            if (search.trim()) chips.push(`Search “${search.trim()}”`);
            chips.push(`Printed ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`);
            return (
              <p className="mt-1 text-[12px] print-only" style={{ color: "#000", display: "none" }}>
                {chips.join(" · ")}
              </p>
            );
          })()}
        </div>
        <div className="flex items-center gap-2 tracker-toolbar">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] disabled:opacity-50"
            style={{
              background: "#ffffff", border: "1px solid #e5edf5", color: "#273951",
              borderRadius: 4, fontWeight: 400,
            }}
            title="Print the filtered list"
          >
            <Printer size={14} /> Print
          </button>
          <button
            type="button"
            onClick={() => exportCsv(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] disabled:opacity-50"
            style={{
              background: "#ffffff",
              border: "1px solid #e5edf5",
              color: "#273951",
              borderRadius: 4,
              fontWeight: 400,
            }}
            title="Download CSV (opens in Excel)"
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded px-4 py-2 text-[14px] text-white"
            style={{ background: "#533afd", fontWeight: 400 }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#4434d4")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#533afd")}
          >
            <Plus size={14} /> New order
          </button>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex flex-wrap gap-1 no-print" style={{ marginBottom: 12 }}>
        {VIEWS.map((v) => {
          const active = view === v.key;
          const count = counts[v.key];
          return (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
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
              title={v.description}
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
              <span>{v.label}</span>
              <span
                style={{
                  marginLeft: 8,
                  color: active ? "#4434d4" : "#94a3b8",
                  fontWeight: 500,
                  fontFeatureSettings: '"tnum"',
                  opacity: active ? 1 : 0.8,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + filters — chip-based UI so the default state is just the
          search box + a single "+ Filter" button. Active filters render as
          inline pills; tapping a pill reopens its picker, the X clears it.
          New filters get added through the "+ Filter" menu. No five-dropdown
          row of always-on widgets. */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        // Auth
        authFilter={authFilter}
        onAuthFilterChange={setAuthFilter}
        // Pending docs
        pendingDocFilter={pendingDocFilter}
        onPendingDocFilterChange={setPendingDocFilter}
        // Order status
        verificationFilter={verificationFilter}
        onVerificationFilterChange={setVerificationFilter}
        // Delivery status
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        // Date
        dateFieldFilter={dateFieldFilter}
        onDateFieldFilterChange={setDateFieldFilter}
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        hasFieldFilter={hasFieldFilter}
        onClearAll={() => {
          setAuthFilter("");
          setPendingDocFilter("");
          setVerificationFilter("");
          setStatusFilter("");
          setDatePreset("all");
          setDateFrom("");
          setDateTo("");
        }}
        countLabel={`${filtered.length} of ${orders.length}`}
      />

      {/* Tracker table */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5edf5",
          borderRadius: 6,
          boxShadow: "rgba(23,23,23,0.06) 0px 3px 6px",
          overflow: "hidden",
        }}
      >
        <div className="md:hidden">
          {filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#64748d", fontSize: 13 }}>
              No orders in this view.
            </div>
          ) : (
            filtered.map((o) => <Card key={o.id} order={o} mounted={mounted} onClick={() => setEditing(o)} />)
          )}
        </div>
        <div className="hidden md:block" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
            {/* Order Type is its own column (Brent 2026-06 request) — the pill
                used to ride under the Order # but reads cleaner alongside the
                other categorical fields. */}
            <colgroup>
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: 120 }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#f6f9fc", borderBottom: "1px solid #e5edf5" }}>
                <Th sortKey="orderNumber" sort={sort} onSort={toggleSort}>Order #</Th>
                <Th sortKey="orderType" sort={sort} onSort={toggleSort}>Order Type</Th>
                <Th sortKey="patient" sort={sort} onSort={toggleSort}>Patient</Th>
                <Th sortKey="facility" sort={sort} onSort={toggleSort}>Facility</Th>
                <Th sortKey="orderDate" sort={sort} onSort={toggleSort}>Order Date</Th>
                <Th sortKey="csr" sort={sort} onSort={toggleSort}>CSR</Th>
                <Th sortKey="driver" sort={sort} onSort={toggleSort}>Driver</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#64748d", fontSize: 13 }}>
                    No orders in this view.
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <Row key={o.id} order={o} mounted={mounted} onClick={() => setEditing(o)} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <OrderForm
          mode="create"
          currentUser={currentUser}
          lookups={lookups}
          onClose={() => setCreating(false)}
          onSaved={applyOrderCreate}
        />
      )}
      {editing && (
        <OrderForm
          mode="edit"
          order={editing}
          currentUser={currentUser}
          lookups={lookups}
          onClose={() => setEditing(null)}
          onSaved={applyOrderUpdate}
        />
      )}
    </div>
  );
}

function Row({ order, onClick }: { order: OrderShape; mounted: boolean; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      style={{
        borderBottom: "1px solid #e5edf5",
        cursor: "pointer",
        background: "#ffffff",
        transition: "background-color 100ms",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f9fc")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
    >
      {/* Cell order mirrors the <colgroup>/<thead> contract above:
          Order # → Order Type → Patient → Facility → Order Date → CSR → Driver.
          Don't reorder one without the other two. */}
      <Td>
        <span
          style={{
            fontFamily: "SourceCodePro, ui-monospace, SFMono-Regular, monospace",
            fontSize: 12,
            color: "#273951",
            fontFeatureSettings: '"tnum"',
            whiteSpace: "nowrap",
          }}
        >
          {order.orderNumber}
        </span>
      </Td>
      <Td>
        <Pill
          label={WORK_ORDER_TYPE_LABELS[order.workOrderType]}
          bg={WORK_ORDER_TYPE_COLORS[order.workOrderType].bg}
          color={WORK_ORDER_TYPE_COLORS[order.workOrderType].color}
        />
      </Td>
      <Td>
        <div
          style={{
            fontWeight: 500,
            color: "#061b31",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={order.patientDisplay}
        >
          {order.patientDisplay || <Muted>—</Muted>}
        </div>
      </Td>
      <Td>
        {order.facilityName ? (
          <div
            style={{
              color: "#273951",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={order.facilityName}
          >
            {order.facilityName}
          </div>
        ) : (
          <Muted>—</Muted>
        )}
      </Td>
      <Td>
        <span style={{ color: "#273951", fontFeatureSettings: '"tnum"', whiteSpace: "nowrap" }}>
          {formatOrderDate(order.createdAt)}
        </span>
      </Td>
      <Td>
        {order.csrName ? (
          <span
            style={{
              color: "#273951",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "block",
            }}
            title={order.csrName}
          >
            {order.csrName}
          </span>
        ) : (
          <Muted>—</Muted>
        )}
      </Td>
      <Td>
        <DriversCell order={order} />
      </Td>
    </tr>
  );
}

function Card({ order, onClick }: { order: OrderShape; mounted: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "12px 14px",
        borderBottom: "1px solid #e5edf5",
        background: "#ffffff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <span
          style={{
            fontFamily: "SourceCodePro, ui-monospace, monospace",
            fontSize: 11,
            color: "#64748d",
            fontFeatureSettings: '"tnum"',
          }}
        >
          {order.orderNumber}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Pill
            label={STATUS_LABELS[order.status]}
            bg={STATUS_COLORS[order.status].bg}
            color={STATUS_COLORS[order.status].color}
          />
          {order.workOrderType !== "DELIVERY" && (
            <Pill
              label={WORK_ORDER_TYPE_LABELS[order.workOrderType]}
              bg={WORK_ORDER_TYPE_COLORS[order.workOrderType].bg}
              color={WORK_ORDER_TYPE_COLORS[order.workOrderType].color}
            />
          )}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: "#061b31", marginBottom: 2 }}>
        {order.patientDisplay || "—"}
      </div>
      <div style={{ fontSize: 12, color: "#64748d", marginBottom: 6 }}>
        {order.facilityName ?? "—"}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12 }}>
        <span style={{ color: "#64748d", fontFeatureSettings: '"tnum"' }}>
          Ordered {formatOrderDate(order.createdAt)}
        </span>
        <span style={{ color: "#94a3b8" }}>·</span>
        {(() => {
          const s = driverSummary(order);
          if (s.kind === "single") return <span style={{ color: "#273951" }}>{s.name}</span>;
          if (s.kind === "multiple") return <span style={{ color: "#4434d4", fontWeight: 500 }}>Multiple drivers ({s.names.length})</span>;
          return <span style={{ color: "#94a3b8" }}>Unassigned</span>;
        })()}
      </div>
    </button>
  );
}

// TrackerClient used to ship a local FilterSelect that was the prototype for
// components/combobox.tsx. The shared Combobox is now the single source.
const FilterSelect = Combobox;

// Chip-based filter bar. Default state is just the search input + a single
// "+ Filter" button — no row of always-on dropdowns. Each active filter
// becomes a pill: clicking the value reopens the picker, the X clears it.
// Inactive filters live behind the "+ Filter" menu; once added, the pill
// stays in place even after the user clears it (via X) only because the
// user explicitly removed it — adding it back is one click away.
type FilterDim = "auth" | "pendingDoc" | "verification" | "status" | "date";
// Full field labels — these match the form's column names verbatim so the
// filter bar reads like "the field you're filtering on", not a shorthand.
// Date uses a dynamic label (the picked date column) — handled inline.
const FILTER_DIM_LABEL: Record<FilterDim, string> = {
  auth: "Authorization Status",
  pendingDoc: "Pending Document Actions",
  verification: "Order Status",
  status: "Delivery Status",
  date: "Date",
};

function FilterBar({
  search, onSearchChange,
  authFilter, onAuthFilterChange,
  pendingDocFilter, onPendingDocFilterChange,
  verificationFilter, onVerificationFilterChange,
  statusFilter, onStatusFilterChange,
  dateFieldFilter, onDateFieldFilterChange,
  datePreset, onDatePresetChange,
  dateFrom, onDateFromChange,
  dateTo, onDateToChange,
  hasFieldFilter, onClearAll,
  countLabel,
}: {
  search: string; onSearchChange: (v: string) => void;
  authFilter: string; onAuthFilterChange: (v: string) => void;
  pendingDocFilter: string; onPendingDocFilterChange: (v: string) => void;
  verificationFilter: string; onVerificationFilterChange: (v: string) => void;
  statusFilter: string; onStatusFilterChange: (v: string) => void;
  dateFieldFilter: DateField; onDateFieldFilterChange: (v: DateField) => void;
  datePreset: DatePreset; onDatePresetChange: (v: DatePreset) => void;
  dateFrom: string; onDateFromChange: (v: string) => void;
  dateTo: string; onDateToChange: (v: string) => void;
  hasFieldFilter: boolean; onClearAll: () => void;
  countLabel: string;
}) {
  // Which filters does the user want visible in the bar? A filter is visible
  // if it has a value OR the user added it via "+ Filter" and is mid-edit.
  // Removing a filter (X on the pill) takes it out of `expanded` so the bar
  // collapses back to the chip set the user actually cares about.
  const [expanded, setExpanded] = useState<Set<FilterDim>>(() => {
    const init = new Set<FilterDim>();
    if (authFilter) init.add("auth");
    if (pendingDocFilter) init.add("pendingDoc");
    if (verificationFilter) init.add("verification");
    if (statusFilter) init.add("status");
    if (datePreset !== "all") init.add("date");
    return init;
  });
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!addMenuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!addMenuRef.current?.contains(e.target as Node)) setAddMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [addMenuOpen]);

  function addDim(dim: FilterDim) {
    setExpanded((prev) => new Set(prev).add(dim));
    setAddMenuOpen(false);
  }
  function removeDim(dim: FilterDim) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(dim);
      return next;
    });
    if (dim === "auth") onAuthFilterChange("");
    else if (dim === "pendingDoc") onPendingDocFilterChange("");
    else if (dim === "verification") onVerificationFilterChange("");
    else if (dim === "status") onStatusFilterChange("");
    else if (dim === "date") {
      onDatePresetChange("all");
      onDateFromChange("");
      onDateToChange("");
    }
  }

  const availableDims: FilterDim[] = (Object.keys(FILTER_DIM_LABEL) as FilterDim[])
    .filter((d) => !expanded.has(d));

  return (
    <div className="flex flex-wrap items-start gap-2 no-print" style={{ marginBottom: 12 }}>
      <SearchInput value={search} onChange={onSearchChange} placeholder="Search by patient, facility, order #..." />

      {expanded.has("auth") && (
        <FilterChip
          label={FILTER_DIM_LABEL.auth}
          onRemove={() => removeDim("auth")}
        >
          <FilterSelect
            value={authFilter}
            onChange={onAuthFilterChange}
            placeholder="Pick auth status"
            options={sortByLabel(AUTH_PICKER_VALUES.map((k) => ({ value: k, label: AUTH_LABELS[k] })))}
          />
        </FilterChip>
      )}
      {expanded.has("pendingDoc") && (
        <FilterChip
          label={FILTER_DIM_LABEL.pendingDoc}
          onRemove={() => removeDim("pendingDoc")}
        >
          <FilterSelect
            value={pendingDocFilter}
            onChange={onPendingDocFilterChange}
            placeholder="Pick document"
            options={sortByLabel(PENDING_DOCUMENT_OPTIONS.map((d) => ({ value: d.key, label: d.label })))}
          />
        </FilterChip>
      )}
      {expanded.has("verification") && (
        <FilterChip
          label={FILTER_DIM_LABEL.verification}
          onRemove={() => removeDim("verification")}
        >
          <FilterSelect
            value={verificationFilter}
            onChange={onVerificationFilterChange}
            placeholder="Pick order status"
            options={sortByLabel((Object.keys(VERIFICATION_STATUS_LABELS) as Array<keyof typeof VERIFICATION_STATUS_LABELS>).map((k) => ({
              value: k,
              label: VERIFICATION_STATUS_LABELS[k],
            })))}
          />
        </FilterChip>
      )}
      {expanded.has("status") && (
        <FilterChip
          label={FILTER_DIM_LABEL.status}
          onRemove={() => removeDim("status")}
        >
          <FilterSelect
            value={statusFilter}
            onChange={onStatusFilterChange}
            placeholder="Pick delivery status"
            options={sortByLabel(DELIVERY_STATUS_PICKER_VALUES.map((k) => ({
              value: k,
              label: STATUS_LABELS[k],
            })))}
          />
        </FilterChip>
      )}
      {expanded.has("date") && (
        // Date filter — the label is the actual date column the user is
        // filtering on (Order Date, Scheduled Discharge Date, etc.). The
        // field picker is the click target on the label, the range picker
        // is the value control.
        <FilterChip
          label={labelForDateField(dateFieldFilter)}
          onRemove={() => removeDim("date")}
          labelPicker={
            <FilterSelect
              value={dateFieldFilter}
              onChange={(v) => onDateFieldFilterChange((v || "orderDate") as DateField)}
              placeholder="Date column"
              options={DATE_FIELD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              clearable={false}
              width={170}
            />
          }
        >
          <FilterSelect
            value={datePreset === "all" ? "" : datePreset}
            onChange={(v) => {
              const next = (v || "all") as DatePreset;
              onDatePresetChange(next);
              if (next !== "custom") { onDateFromChange(""); onDateToChange(""); }
            }}
            placeholder="All time"
            options={DATE_PRESET_OPTIONS}
          />
          {datePreset === "custom" && (
            <>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                style={{ padding: "5px 8px", fontSize: 12, border: "1px solid #e5edf5", borderRadius: 4, color: "#273951", fontFeatureSettings: '"tnum"' }}
                aria-label={`${labelForDateField(dateFieldFilter)} from`}
              />
              <span style={{ fontSize: 12, color: "#94a3b8" }}>–</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                style={{ padding: "5px 8px", fontSize: 12, border: "1px solid #e5edf5", borderRadius: 4, color: "#273951", fontFeatureSettings: '"tnum"' }}
                aria-label={`${labelForDateField(dateFieldFilter)} to`}
              />
            </>
          )}
        </FilterChip>
      )}

      {/* "+ Filter" menu — opens a small list of dimensions not yet in the
          bar. Tabs already cover the most common Delivery Status split, so
          most users won't need to add anything; surfacing this as a single
          button keeps the bar quiet until they do. */}
      {availableDims.length > 0 && (
        <div ref={addMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setAddMenuOpen((s) => !s)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              fontSize: 13,
              color: "#533afd",
              background: "#fff",
              border: "1px dashed rgba(83,58,253,0.4)",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            <Plus size={12} /> Filter
          </button>
          {addMenuOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                minWidth: 200,
                background: "#fff",
                border: "1px solid #e5edf5",
                borderRadius: 4,
                boxShadow: "rgba(23,23,23,0.12) 0px 6px 16px",
                padding: 4,
                zIndex: 30,
              }}
            >
              {availableDims.map((dim) => (
                <button
                  key={dim}
                  type="button"
                  onClick={() => addDim(dim)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    fontSize: 13,
                    color: "#273951",
                    background: "transparent",
                    border: 0,
                    borderRadius: 3,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(83,58,253,0.06)"; e.currentTarget.style.color = "#4434d4"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#273951"; }}
                >
                  {FILTER_DIM_LABEL[dim]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {hasFieldFilter && (
        <button
          type="button"
          onClick={() => {
            onClearAll();
            setExpanded(new Set());
          }}
          style={{
            padding: "6px 10px",
            fontSize: 12,
            color: "#533afd",
            background: "transparent",
            border: 0,
            cursor: "pointer",
          }}
        >
          Clear all
        </button>
      )}

      <div style={{ marginLeft: "auto", fontSize: 12, color: "#64748d", fontFeatureSettings: '"tnum"', alignSelf: "center" }}>
        {countLabel}
      </div>
    </div>
  );
}

// Inline filter group — just label + value picker + tiny remove X, no chip
// background. The label is normally a static field name, but the Date filter
// passes `labelPicker` so the user can click the label itself to choose
// which date column they're filtering on.
function FilterChip({
  label,
  onRemove,
  labelPicker,
  children,
}: {
  label: string;
  onRemove: () => void;
  labelPicker?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 4px" }}>
      {labelPicker ? (
        labelPicker
      ) : (
        <span style={{ fontSize: 12, color: "#64748d", whiteSpace: "nowrap" }}>{label}</span>
      )}
      {children}
      <button
        type="button"
        onClick={onRemove}
        title={`Remove ${label} filter`}
        style={{
          width: 18,
          height: 18,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#cbd5e1",
          background: "transparent",
          border: 0,
          borderRadius: 3,
          cursor: "pointer",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#b03238"; e.currentTarget.style.background = "rgba(229,72,77,0.08)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#cbd5e1"; e.currentTarget.style.background = "transparent"; }}
      >
        <X size={11} />
      </button>
    </span>
  );
}

function filterOrders(
  orders: OrderShape[],
  view: ViewKey,
  search: string,
  fields: {
    authFilter: string; pendingDocFilter: string;
    verificationFilter: string; statusFilter: string;
    dateRange: { from: string; to: string } | null;
    dateField: DateField;
  },
) {
  let list = orders;
  if (view === "open") list = list.filter((o) => !isTerminalStatus(o.status));
  else if (view === "out") list = list.filter((o) => o.status === "OUT_FOR_DELIVERY");
  else if (view === "delivered") list = list.filter((o) => o.status === "DELIVERED");

  if (fields.authFilter) {
    list = list.filter((o) => o.authStatus === fields.authFilter);
  }
  if (fields.verificationFilter) {
    list = list.filter((o) => o.verificationStatus === fields.verificationFilter);
  }
  if (fields.pendingDocFilter) {
    list = list.filter((o) => o.pendingDocuments.includes(fields.pendingDocFilter));
  }
  if (fields.statusFilter) {
    list = list.filter((o) => o.status === fields.statusFilter);
  }
  if (fields.dateRange) {
    // Compare the YYYY-MM-DD slice in UTC so the inclusive boundary matches
    // what the user typed in the date inputs (no TZ drift on either end).
    // The compared column comes from `dateField` — Order Date / Discharge /
    // Requested Delivery / DOS Submitted. Orders missing that date drop out
    // of the range filter; this matches the form-entered "blank" semantics.
    const { from, to } = fields.dateRange;
    list = list.filter((o) => {
      const iso = pickDateForField(o, fields.dateField);
      if (!iso) return false;
      const ymd = iso.slice(0, 10);
      return ymd >= from && ymd <= to;
    });
  }

  if (search.trim()) {
    const q = search.toLowerCase();
    list = list.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.patientDisplay.toLowerCase().includes(q) ||
        (o.facilityName ?? "").toLowerCase().includes(q) ||
        (o.csrName ?? "").toLowerCase().includes(q) ||
        // Per-item driver search — match any item's driver name.
        o.items.some((it) => (it.driverName ?? "").toLowerCase().includes(q)),
    );
  }

  return list;
}

function sortOrders(list: OrderShape[], sort: { key: SortKey; dir: SortDir }): OrderShape[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  const get = (o: OrderShape): string | number => {
    switch (sort.key) {
      case "orderNumber": return o.orderNumber;
      case "orderDate":   return new Date(o.createdAt).getTime();
      case "patient": return o.patientDisplay.toLowerCase();
      case "facility": return (o.facilityName ?? "").toLowerCase();
      case "orderType": return WORK_ORDER_TYPE_LABELS[o.workOrderType].toLowerCase();
      case "csr": return (o.csrName ?? "").toLowerCase();
      case "driver": {
        // Per-item drivers. Single shared name sorts naturally; mixed orders
        // sort under "~~multiple" so they group at the bottom; unassigned
        // sorts last via "~~unassigned" (tildes come after letters).
        const summary = driverSummary(o);
        if (summary.kind === "single") return summary.name.toLowerCase();
        if (summary.kind === "multiple") return "~~multiple";
        return "~~unassigned";
      }
    }
  };
  return [...list].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

// Order Date is the creation timestamp. Render in UTC so the date the user
// sees matches what's in CSV/print (consistent with formatDc).
function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Drivers are per-item per Brent's 2026-06 spec. The Tracker column collapses
// the per-item assignments into one of three display states:
//   - none       → order has no driver-assigned items
//   - single     → every assigned item shares the same driver (or only one)
//   - multiple   → ≥2 distinct drivers across items
// `none` falls through to "Unassigned"; `multiple` shows a chip with a
// tooltip listing every driver.
type DriverSummary =
  | { kind: "none" }
  | { kind: "single"; name: string }
  | { kind: "multiple"; names: string[] };

function driverSummary(order: OrderShape): DriverSummary {
  const names = Array.from(
    new Set(
      order.items
        .map((it) => it.driverName)
        .filter((n): n is string => typeof n === "string" && n.length > 0),
    ),
  );
  if (names.length === 0) return { kind: "none" };
  if (names.length === 1) return { kind: "single", name: names[0] };
  return { kind: "multiple", names };
}

function DriversCell({ order }: { order: OrderShape }) {
  const s = driverSummary(order);
  if (s.kind === "none") return <Muted>Unassigned</Muted>;
  if (s.kind === "single") {
    return (
      <span
        title={s.name}
        style={{
          color: "#273951",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "block",
        }}
      >
        {s.name}
      </span>
    );
  }
  return (
    <span
      title={`Drivers: ${s.names.join(", ")}`}
      style={{
        display: "inline-block",
        background: "rgba(83,58,253,0.10)",
        color: "#4434d4",
        fontSize: 11,
        fontWeight: 500,
        padding: "1px 6px",
        borderRadius: 4,
        border: "1px solid rgba(83,58,253,0.20)",
        whiteSpace: "nowrap",
      }}
    >
      Multiple ({s.names.length})
    </span>
  );
}

type DcUrgency = ReturnType<typeof dcUrgency>;

function formatDc(iso: string | null): { dateLabel: string; urgency: DcUrgency } {
  const urgency = dcUrgency(iso);
  if (!iso) return { dateLabel: "—", urgency };
  // Pin to UTC so SSR and client (any TZ) agree — discharge dates are stored
  // as midnight UTC by pickDate, so this displays the date the user typed.
  const dateLabel = new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return { dateLabel, urgency };
}

// Full tabular export: one row per piece of equipment. An order with 3 items
// becomes 3 rows — order data duplicated; the Driver / Item / Quantity /
// HCPCS / Completed Date columns hold that one item's values. Sorting or
// pivoting in Excel just works. Orders with no equipment still emit one row
// with empty item/driver columns so the order doesn't vanish from the export.
function exportCsv(rows: OrderShape[]): void {
  const header = [
    // identity
    "Order #", "Order Type", "Linked Order #",
    // patient
    "Patient First", "Patient Last",
    // facility
    "Facility Name", "Facility Address", "Facility City", "Facility State",
    "Facility Zip", "Facility Phone", "Facility Contact",
    // ownership
    "CSR", "Handler",
    // scheduling dates
    "Order Date", "Call Received Date", "Scheduled Discharge Date",
    "Requested Delivery Date", "DOS Submitted",
    // lifecycle stamps
    "Printed At", "Acknowledged At", "Out for Delivery At",
    "Door Tagged At", "Cancelled At", "Cancellation Reason",
    // insurance
    "Primary Insurance", "Secondary Insurance",
    "Deductible Status", "Coinsurance %", "Deductible Amount",
    // verification / auth
    "Authorization Status", "Pending Document Actions",
    "Order Status", "Delivery Status", "Eldercare",
    // companies + notes
    "Fulfillment Companies", "Notes",
    // per-item slice — one row per item
    "Driver", "Item", "Quantity", "Category", "Abbreviation",
    "HCPCS Code", "Completed Date", "Door Tags",
    // bookkeeping
    "Created At", "Updated At",
  ];

  const data: string[][] = [];
  for (const o of rows) {
    // Build the duplicated-order columns once, then append per-item columns.
    const orderColumns: string[] = [
      o.orderNumber,
      WORK_ORDER_TYPE_LABELS[o.workOrderType],
      o.linkedOrderNumber ?? "",
      o.patientFirst,
      o.patientLast,
      o.facilityName ?? "",
      o.facilityAddress ?? "",
      o.facilityCity ?? "",
      o.facilityState ?? "",
      o.facilityZip ?? "",
      o.facilityPhone ?? "",
      o.facilityContact ?? "",
      o.csrName ?? "",
      o.handler ?? "",
      fmtDate(o.createdAt),
      fmtDate(o.callReceivedDate),
      fmtDate(o.dischargeDate),
      fmtDate(o.requestedDeliveryDate),
      fmtDate(o.dosSubmitted),
      fmtDate(o.printedAt),
      fmtDate(o.acknowledgedAt),
      fmtDate(o.outForDeliveryAt),
      fmtDate(o.doorTaggedAt),
      fmtDate(o.cancelledAt),
      o.cancellationReason ?? "",
      o.primaryInsuranceKey ?? "",
      o.secondaryInsuranceKey ?? "",
      o.deductibleStatus ?? "",
      o.coinsurancePct != null ? String(o.coinsurancePct) : "",
      o.deductibleAmount != null ? String(o.deductibleAmount) : "",
      AUTH_LABELS[o.authStatus],
      o.pendingDocuments
        .map((k) => PENDING_DOCUMENT_OPTIONS.find((d) => d.key === k)?.label ?? k)
        .join("; "),
      o.verificationStatus ? VERIFICATION_STATUS_LABELS[o.verificationStatus] : "",
      STATUS_LABELS[o.status],
      o.eldercare ? "Yes" : "No",
      o.fulfillmentCompanies.join("; "),
      o.notes ?? "",
    ];
    const trailingColumns: string[] = [fmtDate(o.createdAt), fmtDate(o.updatedAt)];

    if (o.items.length === 0) {
      data.push([...orderColumns, "", "", "", "", "", "", "", "", ...trailingColumns]);
      continue;
    }
    for (const it of o.items) {
      data.push([
        ...orderColumns,
        it.driverName ?? "",
        it.name,
        String(it.quantity),
        it.category ?? "",
        it.abbreviation ?? "",
        it.hcpcsCode ?? "",
        fmtDate(it.completedAt),
        String(it.doorTagCount ?? 0),
        ...trailingColumns,
      ]);
    }
  }
  downloadCsv(`tracker-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...data]);
}

// Render any ISO timestamp as a UTC calendar date so the spreadsheet matches
// what the user typed and what the on-screen columns show. Empty input → "".
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "UTC" });
}

function computeDcBlocker(
  order: OrderShape,
  urgency: DcUrgency,
): { label: string; tooltip: string } | null {
  if (urgency !== "urgent" && urgency !== "overdue") return null;
  // Order is already wrapped up / actively moving — no blocker chip needed.
  if (order.status === "DELIVERED" || order.status === "CANCELLED" || order.status === "OUT_FOR_DELIVERY") return null;
  if (order.authStatus !== "NOT_REQ" && order.authStatus !== "APPROVED") {
    return { label: "auth pending", tooltip: `Discharge is imminent and auth is ${AUTH_LABELS[order.authStatus]}.` };
  }
  return null;
}

function deriveOrderDisplay(order: OrderShape) {
  const dcInfo = formatDc(order.dischargeDate);
  return {
    dcInfo,
    dcBlocker: computeDcBlocker(order, dcInfo.urgency),
  };
}

function BlockerChip({ blocker }: { blocker: { label: string; tooltip: string } }) {
  return (
    <span
      title={blocker.tooltip}
      style={{
        background: "rgba(229,72,77,0.12)",
        color: "#b03238",
        fontSize: 10,
        fontWeight: 500,
        padding: "1px 5px",
        borderRadius: 3,
        border: "1px solid rgba(229,72,77,0.25)",
      }}
    >
      {blocker.label}
    </span>
  );
}
