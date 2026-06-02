"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AUTH_IN_FLIGHT,
  AUTH_LABELS,
  STAGE_COLORS,
  STAGE_LABELS,
  VERIFICATION_STATUS_LABELS,
  WORK_ORDER_TYPE_COLORS,
  WORK_ORDER_TYPE_LABELS,
  authAgingDays,
  dcUrgency,
  type OrderShape,
} from "@/lib/order-types";
import type { WorkOrderType } from "@prisma/client";
import OrderForm from "./OrderForm";
import { Download, Plus, Printer } from "lucide-react";
import { Muted, Pill, SearchInput, Td, Th, hexWithAlpha } from "@/components/admin-ui";
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

type ViewKey = "all" | "open" | "ready" | "out" | "auth" | "delivered";
type SortKey = "orderNumber" | "patient" | "facility" | "stage" | "csr" | "driver" | "discharge" | "orderDate";
type SortDir = "asc" | "desc";

const VIEWS: { key: ViewKey; label: string; description: string }[] = [
  { key: "open",      label: "Open",             description: "Everything in flight" },
  { key: "auth",      label: "Auth Follow-Ups",  description: "Pending insurance authorization" },
  { key: "ready",     label: "Ready to Assign",  description: "Verification done, no dispatcher yet" },
  { key: "out",       label: "Out for Delivery", description: "Dispatcher en route" },
  { key: "delivered", label: "Delivered",        description: "Closed loop" },
  { key: "all",       label: "All",              description: "Every order" },
];

const VALID_VIEWS = new Set<ViewKey>(["all", "open", "ready", "out", "auth", "delivered"]);

// Order Date presets shown next to the date inputs. The "no filter" state is
// represented by `datePreset === "all"` (the value FilterSelect uses for its
// cleared option) — keeping it out of this list means every consumer renders
// exactly the options that appear in the dropdown, plus the "custom" sentinel
// appended once below in DATE_PRESET_OPTIONS.
type DatePreset = "all" | "7d" | "30d" | "90d" | "ytd" | "custom";
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
  const [insuranceFilter, setInsuranceFilter] = useState("");
  const [authFilter, setAuthFilter] = useState("");
  const [deductibleFilter, setDeductibleFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  // Brent 2026-06: Verification Status filter. Empty string = no filter.
  const [verificationFilter, setVerificationFilter] = useState("");
  const [editing, setEditing] = useState<OrderShape | null>(null);
  const [creating, setCreating] = useState(initialNew);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "discharge", dir: "asc" });
  // Order Date range filter — drives both table results AND CSV/Print output.
  // Preset "all" → no filter; "custom" → use the inline from/to date inputs.
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
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
          { insuranceFilter, authFilter, deductibleFilter, companyFilter, typeFilter, verificationFilter, dateRange },
        ),
        sort,
      ),
    [orders, view, search, insuranceFilter, authFilter, deductibleFilter, companyFilter, typeFilter, verificationFilter, dateRange, sort],
  );
  const hasFieldFilter =
    insuranceFilter !== "" || authFilter !== "" || deductibleFilter !== "" || companyFilter !== "" || typeFilter !== "" || verificationFilter !== "" || datePreset !== "all";
  const counts = useMemo(() => {
    const m: Record<ViewKey, number> = {
      all: orders.length,
      open: 0, ready: 0, out: 0, auth: 0, delivered: 0,
    };
    for (const o of orders) {
      if (o.stage !== "DELIVERED" && o.stage !== "CANCELLED") m.open++;
      if (o.stage === "READY_TO_ASSIGN") m.ready++;
      if (o.stage === "OUT_FOR_DELIVERY") m.out++;
      if (AUTH_IN_FLIGHT.includes(o.authStatus)) m.auth++;
      if (o.stage === "DELIVERED") m.delivered++;
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
            Every order from initial intake through delivery. Status derives from data — never picked manually.
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
            if (dateRange) chips.push(`Order Date ${dateRange.from} → ${dateRange.to}`);
            if (insuranceFilter) chips.push(`Insurance ${insuranceFilter}`);
            if (authFilter) chips.push(`Auth ${authFilter}`);
            if (deductibleFilter) chips.push(`Deductible ${deductibleFilter}`);
            if (companyFilter) chips.push(`Company ${companyFilter}`);
            if (typeFilter) chips.push(`Type ${typeFilter}`);
            if (verificationFilter) chips.push(`Verification ${VERIFICATION_STATUS_LABELS[verificationFilter as keyof typeof VERIFICATION_STATUS_LABELS]}`);
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

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2 no-print" style={{ marginBottom: 12 }}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by patient, facility, order #..."
        />

        <FilterSelect
          value={insuranceFilter}
          onChange={setInsuranceFilter}
          placeholder="All insurance"
          options={lookups.insurance.map((i) => ({ value: i.key, label: i.label }))}
        />
        <FilterSelect
          value={authFilter}
          onChange={setAuthFilter}
          placeholder="All auth"
          options={(Object.keys(AUTH_LABELS) as Array<keyof typeof AUTH_LABELS>).map((k) => ({
            value: k,
            label: AUTH_LABELS[k],
          }))}
        />
        <FilterSelect
          value={deductibleFilter}
          onChange={setDeductibleFilter}
          placeholder="All deductible"
          options={[
            { value: "MET", label: "Met" },
            { value: "NOT_MET", label: "Not Met" },
            { value: "NA", label: "N/A" },
          ]}
        />
        <FilterSelect
          value={companyFilter}
          onChange={setCompanyFilter}
          placeholder="All companies"
          options={lookups.companies.map((c) => ({ value: c.key, label: c.label }))}
        />
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          placeholder="All types"
          options={(Object.keys(WORK_ORDER_TYPE_LABELS) as WorkOrderType[]).map((k) => ({
            value: k,
            label: WORK_ORDER_TYPE_LABELS[k],
          }))}
        />
        <FilterSelect
          value={verificationFilter}
          onChange={setVerificationFilter}
          placeholder="All verification"
          options={(Object.keys(VERIFICATION_STATUS_LABELS) as Array<keyof typeof VERIFICATION_STATUS_LABELS>).map((k) => ({
            value: k,
            label: VERIFICATION_STATUS_LABELS[k],
          }))}
        />
        <FilterSelect
          value={datePreset === "all" ? "" : datePreset}
          onChange={(v) => {
            const next = (v || "all") as DatePreset;
            setDatePreset(next);
            // Clear the custom inputs when switching off custom so the chip
            // count and CSV match what's onscreen.
            if (next !== "custom") { setDateFrom(""); setDateTo(""); }
          }}
          placeholder="All time"
          options={DATE_PRESET_OPTIONS}
        />
        {datePreset === "custom" && (
          <>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ padding: "5px 8px", fontSize: 12, border: "1px solid #e5edf5", borderRadius: 4, color: "#273951", fontFeatureSettings: '"tnum"' }}
              aria-label="Order date from"
            />
            <span style={{ fontSize: 12, color: "#94a3b8" }}>–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ padding: "5px 8px", fontSize: 12, border: "1px solid #e5edf5", borderRadius: 4, color: "#273951", fontFeatureSettings: '"tnum"' }}
              aria-label="Order date to"
            />
          </>
        )}

        {hasFieldFilter && (
          <button
            type="button"
            onClick={() => {
              setInsuranceFilter("");
              setAuthFilter("");
              setDeductibleFilter("");
              setCompanyFilter("");
              setTypeFilter("");
              setVerificationFilter("");
              setDatePreset("all");
              setDateFrom("");
              setDateTo("");
            }}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              color: "#533afd",
              background: "transparent",
              border: 0,
            }}
          >
            Clear filters
          </button>
        )}

        <div style={{ marginLeft: "auto", fontSize: 12, color: "#64748d", fontFeatureSettings: '"tnum"' }}>
          {filtered.length} of {orders.length}
        </div>
      </div>

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
            {/* Column order is intentional: identity → who → where → when
                (both dates together) → status → owners (both people together).
                Dates sit next to each other so the user can scan urgency
                without jumping across the row. */}
            <colgroup>
              <col style={{ width: 130 }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#f6f9fc", borderBottom: "1px solid #e5edf5" }}>
                <Th sortKey="orderNumber" sort={sort} onSort={toggleSort}>Order #</Th>
                <Th sortKey="patient" sort={sort} onSort={toggleSort}>Patient</Th>
                <Th sortKey="facility" sort={sort} onSort={toggleSort}>Facility</Th>
                <Th sortKey="orderDate" sort={sort} onSort={toggleSort}>Order Date</Th>
                <Th sortKey="discharge" sort={sort} onSort={toggleSort}>Discharge Date</Th>
                <Th sortKey="stage" sort={sort} onSort={toggleSort}>Stage</Th>
                <Th sortKey="csr" sort={sort} onSort={toggleSort}>CSR</Th>
                <Th sortKey="driver" sort={sort} onSort={toggleSort}>Driver</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#64748d", fontSize: 13 }}>
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

function Row({ order, mounted, onClick }: { order: OrderShape; mounted: boolean; onClick: () => void }) {
  const { dcInfo, stageColor, authAge, showAuthAge, dcBlocker } = deriveOrderDisplay(order);

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
          Order # → Patient → Facility → Order Date → Discharge Date →
          Stage → CSR → Dispatcher. Don't reorder one without the other two. */}
      <Td>
        <div
          style={{
            fontFamily: "SourceCodePro, ui-monospace, SFMono-Regular, monospace",
            fontSize: 12,
            color: "#273951",
            fontFeatureSettings: '"tnum"',
            whiteSpace: "nowrap",
          }}
        >
          {order.orderNumber}
        </div>
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
        {order.dischargeDate ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#273951", fontWeight: 500, fontFeatureSettings: '"tnum"', whiteSpace: "nowrap" }}>
            <span>{dcInfo.dateLabel}</span>
            {mounted && dcBlocker && <BlockerChip blocker={dcBlocker} />}
          </span>
        ) : (
          <Muted>—</Muted>
        )}
      </Td>
      <Td>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          <Pill label={STAGE_LABELS[order.stage]} bg={stageColor.bg} color={stageColor.color} />
          {order.workOrderType !== "DELIVERY" && (
            <Pill
              label={WORK_ORDER_TYPE_LABELS[order.workOrderType]}
              bg={WORK_ORDER_TYPE_COLORS[order.workOrderType].bg}
              color={WORK_ORDER_TYPE_COLORS[order.workOrderType].color}
            />
          )}
          {mounted && showAuthAge && authAge !== null && (
            <>
              <span style={{ color: "#b03238", fontSize: 10, fontWeight: 500 }}>·</span>
              <AuthAgePill status={order.authStatus} age={authAge} />
            </>
          )}
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

function Card({ order, mounted, onClick }: { order: OrderShape; mounted: boolean; onClick: () => void }) {
  const { dcInfo, stageColor, authAge, showAuthAge, dcBlocker } = deriveOrderDisplay(order);
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
          <Pill label={STAGE_LABELS[order.stage]} bg={stageColor.bg} color={stageColor.color} />
          {order.workOrderType !== "DELIVERY" && (
            <Pill
              label={WORK_ORDER_TYPE_LABELS[order.workOrderType]}
              bg={WORK_ORDER_TYPE_COLORS[order.workOrderType].bg}
              color={WORK_ORDER_TYPE_COLORS[order.workOrderType].color}
            />
          )}
          {mounted && showAuthAge && authAge !== null && (
            <AuthAgePill status={order.authStatus} age={authAge} />
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
        {order.dischargeDate && (
          <>
            <span style={{ color: "#94a3b8" }}>·</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#273951", fontWeight: 500, fontFeatureSettings: '"tnum"' }}>
              <span>DC {dcInfo.dateLabel}</span>
              {mounted && dcBlocker && <BlockerChip blocker={dcBlocker} />}
            </span>
          </>
        )}
      </div>
    </button>
  );
}

// TrackerClient used to ship a local FilterSelect that was the prototype for
// components/combobox.tsx. The shared Combobox is now the single source.
const FilterSelect = Combobox;

function filterOrders(
  orders: OrderShape[],
  view: ViewKey,
  search: string,
  fields: {
    insuranceFilter: string; authFilter: string; deductibleFilter: string;
    companyFilter: string; typeFilter: string; verificationFilter: string;
    dateRange: { from: string; to: string } | null;
  },
) {
  let list = orders;
  if (view === "open") list = list.filter((o) => o.stage !== "DELIVERED" && o.stage !== "CANCELLED");
  else if (view === "ready") list = list.filter((o) => o.stage === "READY_TO_ASSIGN");
  else if (view === "out") list = list.filter((o) => o.stage === "OUT_FOR_DELIVERY");
  else if (view === "auth") list = list.filter((o) =>
    AUTH_IN_FLIGHT.includes(o.authStatus),
  );
  else if (view === "delivered") list = list.filter((o) => o.stage === "DELIVERED");

  if (fields.insuranceFilter) {
    list = list.filter(
      (o) =>
        o.primaryInsuranceKey === fields.insuranceFilter ||
        o.secondaryInsuranceKey === fields.insuranceFilter,
    );
  }
  if (fields.authFilter) {
    list = list.filter((o) => o.authStatus === fields.authFilter);
  }
  if (fields.deductibleFilter) {
    list = list.filter((o) => o.deductibleStatus === fields.deductibleFilter);
  }
  if (fields.companyFilter) {
    list = list.filter((o) => o.fulfillmentCompanies.includes(fields.companyFilter));
  }
  if (fields.typeFilter) {
    list = list.filter((o) => o.workOrderType === fields.typeFilter);
  }
  if (fields.verificationFilter) {
    list = list.filter((o) => o.verificationStatus === fields.verificationFilter);
  }
  if (fields.dateRange) {
    // Compare the YYYY-MM-DD slice in UTC so the inclusive boundary matches
    // what the user typed in the date inputs (no TZ drift on either end).
    const { from, to } = fields.dateRange;
    list = list.filter((o) => {
      const ymd = o.createdAt.slice(0, 10);
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
      case "stage": return o.stage;
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
      case "discharge": return o.dischargeDate ? new Date(o.dischargeDate).getTime() : Number.MAX_SAFE_INTEGER;
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

function exportCsv(rows: OrderShape[]): void {
  // Column order mirrors the on-screen table so users see the same row layout
  // whether they're scanning live, printed, or opened in Excel.
  // Extra columns (Auth, Insurance, Companies, Items) tail after the visible
  // ones — they don't show in the table but are useful in spreadsheet form.
  const header = [
    "Order #", "Patient", "Facility", "Order Date", "Discharge",
    "Stage", "CSR", "Driver(s)",
    "Authorization Status", "Primary Insurance", "Companies", "Items",
  ];
  const data = rows.map((o) => [
    o.orderNumber,
    o.patientDisplay,
    o.facilityName ?? "",
    new Date(o.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" }),
    o.dischargeDate ? new Date(o.dischargeDate).toLocaleDateString("en-US", { timeZone: "UTC" }) : "",
    STAGE_LABELS[o.stage],
    o.csrName ?? "",
    // Per-item driver names, deduped — joined as "; " so Excel sees one cell.
    Array.from(new Set(o.items.map((it) => it.driverName).filter((n): n is string => !!n))).join("; "),
    AUTH_LABELS[o.authStatus],
    o.primaryInsuranceKey ?? "",
    o.fulfillmentCompanies.join("; "),
    o.items.map((it) => `${it.abbreviation || it.name}${it.quantity > 1 ? ` x${it.quantity}` : ""}`).join("; "),
  ]);
  downloadCsv(`tracker-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...data]);
}

function computeDcBlocker(
  order: OrderShape,
  urgency: DcUrgency,
): { label: string; tooltip: string } | null {
  if (urgency !== "urgent" && urgency !== "overdue") return null;
  if (order.stage === "DELIVERED" || order.stage === "CANCELLED" || order.stage === "OUT_FOR_DELIVERY") return null;
  if (order.authStatus !== "NOT_REQ" && order.authStatus !== "APPROVED") {
    return { label: "auth pending", tooltip: `Discharge is imminent and auth is ${AUTH_LABELS[order.authStatus]}.` };
  }
  return null;
}

function deriveOrderDisplay(order: OrderShape) {
  const dcInfo = formatDc(order.dischargeDate);
  const authAge = authAgingDays(order.authStatus, order.authSubmittedAt);
  return {
    dcInfo,
    stageColor: STAGE_COLORS[order.stage],
    authAge,
    showAuthAge: authAge !== null && authAge > 5,
    dcBlocker: computeDcBlocker(order, dcInfo.urgency),
  };
}

function AuthAgePill({ status, age }: { status: OrderShape["authStatus"]; age: number }) {
  return (
    <span
      title={`Auth ${AUTH_LABELS[status]} for ${age}d`}
      style={{ color: "#b03238", fontSize: 10, fontWeight: 500 }}
    >
      auth {age}d
    </span>
  );
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
