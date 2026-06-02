"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  ChevronDown,
  Check,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Line,
} from "recharts";
import { STAGE_LABELS, STATUS_LABELS, type OrderShape } from "@/lib/order-types";

// Brent 2026-06 commit B: dispatcherName / deliveredAt / planType were dropped
// from OrderShape. These derived helpers replace the legacy field reads:
// - driverDisplay: single shared name across items, or "Multiple" if mixed
// - effectiveDeliveredAt: max completedAt only when every item is completed
function driverDisplay(o: OrderShape): string | null {
  const names = Array.from(new Set(o.items.map((it) => it.driverName).filter((n): n is string => !!n)));
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return "Multiple";
}
function effectiveDeliveredAt(o: OrderShape): string | null {
  if (o.items.length === 0) return null;
  let max: string | null = null;
  for (const it of o.items) {
    if (!it.completedAt) return null; // partial completion — order not done
    if (!max || it.completedAt > max) max = it.completedAt;
  }
  return max;
}
import { downloadCsv } from "@/lib/utils";

type Props = {
  orders: OrderShape[];
  insurance: Array<{ key: string; label: string }>;
  companies: Array<{ key: string; label: string }>;
  equipment: Array<{ id: string; name: string; abbreviation: string; category: string }>;
  initialSearch: Record<string, string | string[] | undefined>;
};

const PRIMARY = "#533afd";
const PRIMARY_BG = "rgba(83,58,253,0.08)";
const DARK = "#061b31";
const BODY = "#273951";
const MUTED = "#64748d";
const BORDER = "#e5edf5";
const PANEL_BG = "#ffffff";
const PAGE_BG = "#f6f9fc";

const COLOR_DELIVERED = "#108c3d";
const COLOR_CANCELLED = "#b03238";
const COLOR_INFLIGHT = "#2874ad";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Granularity = "day" | "week" | "month" | "quarter";

const GRANULARITY_OPTIONS: Array<{ value: Granularity; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

type Filters = {
  facilities: Set<string>;
  dispatchers: Set<string>;
  companies: Set<string>;
  insurance: Set<string>;
  stages: Set<string>;
  statuses: Set<string>;
  categories: Set<string>;
};

function emptyFilters(): Filters {
  return {
    facilities: new Set(),
    dispatchers: new Set(),
    companies: new Set(),
    insurance: new Set(),
    stages: new Set(),
    statuses: new Set(),
    categories: new Set(),
  };
}

function passesFilters(o: OrderShape, f: Filters): boolean {
  if (f.facilities.size && (!o.facilityName || !f.facilities.has(o.facilityName))) return false;
  if (f.dispatchers.size) {
    const dn = driverDisplay(o);
    if (!dn || !f.dispatchers.has(dn)) return false;
  }
  if (f.companies.size && !o.fulfillmentCompanies.some((c) => f.companies.has(c))) return false;
  if (f.insurance.size && (!o.primaryInsuranceKey || !f.insurance.has(o.primaryInsuranceKey))) return false;
  if (f.stages.size && !f.stages.has(o.stage)) return false;
  if (f.statuses.size && !f.statuses.has(o.status)) return false;
  if (f.categories.size && !o.items.some((it) => f.categories.has(it.category))) return false;
  return true;
}

function totalActiveFilters(f: Filters): number {
  return f.facilities.size + f.dispatchers.size + f.companies.size + f.insurance.size + f.stages.size + f.statuses.size + f.categories.size;
}

function isoDayString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultDateRange() {
  const t = new Date();
  const f = new Date(t);
  f.setDate(t.getDate() - 90);
  return { from: isoDayString(f), to: isoDayString(t) };
}

type PresetKey = "30d" | "90d" | "180d" | "1y" | "mtd" | "qtd" | "ytd";

const RANGE_PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: "30d",  label: "30d" },
  { key: "90d",  label: "90d" },
  { key: "180d", label: "180d" },
  { key: "1y",   label: "1y" },
  { key: "mtd",  label: "MTD" },
  { key: "qtd",  label: "QTD" },
  { key: "ytd",  label: "YTD" },
];

function presetRange(key: PresetKey): { from: string; to: string } {
  const t = new Date();
  const to = isoDayString(t);
  if (key === "mtd") {
    const f = new Date(t.getFullYear(), t.getMonth(), 1);
    return { from: isoDayString(f), to };
  }
  if (key === "qtd") {
    const qStart = Math.floor(t.getMonth() / 3) * 3;
    const f = new Date(t.getFullYear(), qStart, 1);
    return { from: isoDayString(f), to };
  }
  if (key === "ytd") {
    const f = new Date(t.getFullYear(), 0, 1);
    return { from: isoDayString(f), to };
  }
  const days = key === "30d" ? 30 : key === "90d" ? 90 : key === "180d" ? 180 : 365;
  const f = new Date(t);
  f.setDate(t.getDate() - days);
  return { from: isoDayString(f), to };
}

function activePreset(from: string, to: string): PresetKey | null {
  for (const p of RANGE_PRESETS) {
    const r = presetRange(p.key);
    if (r.from === from && r.to === to) return p.key;
  }
  return null;
}

function formatRangeLabel(from: string, to: string): string {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to + "T00:00:00");
  const sameYear = f.getFullYear() === t.getFullYear();
  const fLabel = `${MONTHS[f.getMonth()]} ${f.getDate()}${sameYear ? "" : ", " + f.getFullYear()}`;
  const tLabel = `${MONTHS[t.getMonth()]} ${t.getDate()}, ${t.getFullYear()}`;
  return `${fLabel} – ${tLabel}`;
}

function rangeMs(from: string, to: string) {
  return {
    fromTs: from ? new Date(from + "T00:00:00").getTime() : Number.NEGATIVE_INFINITY,
    toTs: to ? new Date(to + "T23:59:59").getTime() : Number.POSITIVE_INFINITY,
  };
}

function priorRange(from: string, to: string): { from: string; to: string } {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to + "T00:00:00");
  const days = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1);
  const priorTo = new Date(f.getTime() - 86400000);
  const priorFrom = new Date(priorTo.getTime() - (days - 1) * 86400000);
  return { from: isoDayString(priorFrom), to: isoDayString(priorTo) };
}

function bucketKey(d: Date, gran: Granularity): string {
  if (gran === "day") return isoDayString(d);
  if (gran === "week") {
    const monday = new Date(d);
    const dow = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - dow);
    return isoDayString(monday);
  }
  if (gran === "month") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

function bucketLabel(key: string, gran: Granularity): string {
  if (gran === "day") {
    const d = new Date(key + "T00:00:00");
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }
  if (gran === "week") {
    const d = new Date(key + "T00:00:00");
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }
  if (gran === "month") {
    const [y, m] = key.split("-");
    return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
  }
  return key;
}

function enumerateBuckets(from: string, to: string, gran: Granularity): string[] {
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  const out: string[] = [];
  const seen = new Set<string>();
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    const key = bucketKey(cur, gran);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function formatHours(h: number): string {
  if (!h) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function formatPct(p: number): string {
  if (!isFinite(p)) return "—";
  return `${(p * 100).toFixed(1)}%`;
}

function formatDelta(curr: number, prior: number): { text: string; dir: "up" | "down" | "flat" } {
  if (prior === 0 && curr === 0) return { text: "—", dir: "flat" };
  if (prior === 0) return { text: "new", dir: "up" };
  const pct = (curr - prior) / prior;
  const dir = Math.abs(pct) < 0.005 ? "flat" : pct > 0 ? "up" : "down";
  const sign = pct > 0 ? "+" : "";
  return { text: `${sign}${(pct * 100).toFixed(1)}%`, dir };
}

type Dimension = "facility" | "driver" | "company" | "insurance" | "category" | "item" | "stage" | "status" | "coinsurance" | "deductible" | "dow" | "time";
type Metric = "orders" | "units" | "delivered" | "cancelled" | "avgHours" | "cancelRate";

const DIMENSION_OPTIONS: Array<{ value: Dimension; label: string }> = [
  { value: "facility", label: "Facility" },
  { value: "driver", label: "Driver" },
  { value: "company", label: "Fulfillment company" },
  { value: "insurance", label: "Insurance" },
  { value: "category", label: "Equipment category" },
  { value: "item", label: "Equipment item" },
  { value: "stage", label: "Stage" },
  { value: "status", label: "Status" },
  { value: "coinsurance", label: "Coinsurance %" },
  { value: "deductible", label: "Deductible amount" },
  { value: "dow", label: "Day of week" },
  { value: "time", label: "Time bucket" },
];

const METRIC_OPTIONS: Array<{ value: Metric; label: string }> = [
  { value: "orders", label: "Orders" },
  { value: "units", label: "Units shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "avgHours", label: "Avg fulfillment (hrs)" },
  { value: "cancelRate", label: "Cancellation rate" },
];

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PRESETS: Array<{ label: string; rowDim: Dimension; colDim: Dimension | "none"; metric: Metric }> = [
  { label: "Equipment by facility", rowDim: "facility", colDim: "category", metric: "units" },
  { label: "Driver workload", rowDim: "driver", colDim: "time", metric: "orders" },
  { label: "Company performance", rowDim: "company", colDim: "time", metric: "orders" },
  { label: "Stage by month", rowDim: "stage", colDim: "time", metric: "orders" },
];

const VALID_GRAN = ["day", "week", "month", "quarter"] as const satisfies readonly Granularity[];
const VALID_DIM = [
  "facility", "driver", "company", "insurance",
  "category", "item", "stage", "status", "coinsurance", "deductible", "dow", "time",
] as const satisfies readonly Dimension[];
const VALID_METRIC = [
  "orders", "units", "delivered", "cancelled", "avgHours", "cancelRate",
] as const satisfies readonly Metric[];
const VALID_STAGE = new Set(Object.keys(STAGE_LABELS));
const VALID_STATUS = new Set(Object.keys(STATUS_LABELS));

function isOneOf<T extends string>(v: string | undefined, allowed: readonly T[]): v is T {
  return v !== undefined && (allowed as readonly string[]).includes(v);
}

function pickFromQuery(q: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = q[key];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function pickAllFromQuery(q: Record<string, string | string[] | undefined>, key: string): string[] {
  const v = q[key];
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

type ReportState = {
  from: string;
  to: string;
  granularity: Granularity;
  compare: boolean;
  filters: Filters;
  explorerRow: Dimension;
  explorerCol: Dimension | "none";
  explorerMetric: Metric;
};

function readInitialState(q: Record<string, string | string[] | undefined>): ReportState {
  const def = defaultDateRange();
  const from = pickFromQuery(q, "from") || def.from;
  const to = pickFromQuery(q, "to") || def.to;

  const g = pickFromQuery(q, "g");
  const granularity: Granularity = isOneOf(g, VALID_GRAN) ? g : "month";

  const compare = pickFromQuery(q, "c") === "1";

  const filters: Filters = {
    facilities: new Set(pickAllFromQuery(q, "fac")),
    dispatchers: new Set(pickAllFromQuery(q, "dis")),
    companies: new Set(pickAllFromQuery(q, "co")),
    insurance: new Set(pickAllFromQuery(q, "ins")),
    stages: new Set(pickAllFromQuery(q, "st").filter((s) => VALID_STAGE.has(s))),
    statuses: new Set(pickAllFromQuery(q, "stat").filter((s) => VALID_STATUS.has(s))),
    categories: new Set(pickAllFromQuery(q, "cat")),
  };

  const er = pickFromQuery(q, "er");
  const explorerRow: Dimension = isOneOf(er, VALID_DIM) ? er : "facility";

  const ec = pickFromQuery(q, "ec");
  const explorerCol: Dimension | "none" =
    ec === "none" ? "none" : isOneOf(ec, VALID_DIM) ? ec : "category";

  const em = pickFromQuery(q, "em");
  const explorerMetric: Metric = isOneOf(em, VALID_METRIC) ? em : "units";

  return { from, to, granularity, compare, filters, explorerRow, explorerCol, explorerMetric };
}

function buildSearchString(state: ReportState): string {
  const params = new URLSearchParams();
  params.set("from", state.from);
  params.set("to", state.to);
  if (state.granularity !== "month") params.set("g", state.granularity);
  if (state.compare) params.set("c", "1");
  for (const v of state.filters.facilities) params.append("fac", v);
  for (const v of state.filters.dispatchers) params.append("dis", v);
  for (const v of state.filters.companies) params.append("co", v);
  for (const v of state.filters.insurance) params.append("ins", v);
  for (const v of state.filters.stages) params.append("st", v);
  for (const v of state.filters.statuses) params.append("stat", v);
  for (const v of state.filters.categories) params.append("cat", v);
  if (state.explorerRow !== "facility") params.set("er", state.explorerRow);
  if (state.explorerCol !== "category") params.set("ec", state.explorerCol);
  if (state.explorerMetric !== "units") params.set("em", state.explorerMetric);
  return params.toString();
}

export default function ReportingClient({ orders, insurance, companies, equipment, initialSearch }: Props) {
  const router = useRouter();
  const initialRef = useRef<ReportState | null>(null);
  if (initialRef.current === null) initialRef.current = readInitialState(initialSearch);
  const initial = initialRef.current;

  const [{ from, to }, setDateRange] = useState({ from: initial.from, to: initial.to });
  const setFrom = (v: string) => setDateRange((r) => ({ ...r, from: v }));
  const setTo = (v: string) => setDateRange((r) => ({ ...r, to: v }));
  const [granularity, setGranularity] = useState<Granularity>(initial.granularity);
  const [compare, setCompare] = useState(initial.compare);
  const [filters, setFilters] = useState<Filters>(initial.filters);

  const [explorerRow, setExplorerRow] = useState<Dimension>(initial.explorerRow);
  const [explorerCol, setExplorerCol] = useState<Dimension | "none">(initial.explorerCol);
  const [explorerMetric, setExplorerMetric] = useState<Metric>(initial.explorerMetric);

  const lastQueryRef = useRef<string | null>(null);
  useEffect(() => {
    const qs = buildSearchString({ from, to, granularity, compare, filters, explorerRow, explorerCol, explorerMetric });
    if (lastQueryRef.current === qs) return;
    lastQueryRef.current = qs;
    router.replace(`?${qs}`, { scroll: false });
  }, [from, to, granularity, compare, filters, explorerRow, explorerCol, explorerMetric, router]);

  function setFilterField<K extends keyof Filters>(key: K, value: Set<string>) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(key: PresetKey) {
    setDateRange(presetRange(key));
  }

  function applyExplorerPreset(p: (typeof PRESETS)[number]) {
    setExplorerRow(p.rowDim);
    setExplorerCol(p.colDim);
    setExplorerMetric(p.metric);
  }

  const insuranceLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of insurance) m.set(i.key, i.label);
    return m;
  }, [insurance]);

  const companyLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) m.set(c.key, c.label);
    return m;
  }, [companies]);

  const equipMeta = useMemo(() => {
    const m = new Map<string, { category: string; abbreviation: string; name: string }>();
    for (const e of equipment) m.set(e.id, { category: e.category, abbreviation: e.abbreviation, name: e.name });
    return m;
  }, [equipment]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of equipment) set.add(e.category);
    return Array.from(set).sort();
  }, [equipment]);

  const filterOptions = useMemo(() => {
    const facilitiesSet = new Set<string>();
    const dispatchersSet = new Set<string>();
    for (const o of orders) {
      if (o.facilityName) facilitiesSet.add(o.facilityName);
      const dn = driverDisplay(o);
      if (dn) dispatchersSet.add(dn);
    }
    return {
      facilities: Array.from(facilitiesSet).sort().map((v) => ({ value: v, label: v })),
      dispatchers: Array.from(dispatchersSet).sort().map((v) => ({ value: v, label: v })),
      companies: companies.map((c) => ({ value: c.key, label: c.label })),
      insurance: insurance.map((i) => ({ value: i.key, label: i.label })),
      stages: (Object.keys(STAGE_LABELS) as Array<keyof typeof STAGE_LABELS>).map((s) => ({
        value: s,
        label: STAGE_LABELS[s],
      })),
      statuses: (Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((s) => ({
        value: s,
        label: STATUS_LABELS[s],
      })),
      categories: categories.map((c) => ({ value: c, label: c })),
    };
  }, [orders, companies, insurance, categories]);

  const current = useMemo(() => {
    const { fromTs, toTs } = rangeMs(from, to);
    return orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      if (t < fromTs || t > toTs) return false;
      return passesFilters(o, filters);
    });
  }, [orders, from, to, filters]);

  // Funnel ignores the stage and status filters — those selections should highlight, not hide stages.
  const currentForFunnel = useMemo(() => {
    if (filters.stages.size === 0 && filters.statuses.size === 0) return current;
    const { fromTs, toTs } = rangeMs(from, to);
    const noStage = { ...filters, stages: new Set<string>(), statuses: new Set<string>() };
    return orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      if (t < fromTs || t > toTs) return false;
      return passesFilters(o, noStage);
    });
  }, [orders, from, to, filters, current]);

  const prior = useMemo(() => {
    if (!compare) return [];
    const r = priorRange(from, to);
    const { fromTs, toTs } = rangeMs(r.from, r.to);
    return orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      if (t < fromTs || t > toTs) return false;
      return passesFilters(o, filters);
    });
  }, [orders, from, to, filters, compare]);

  const kpisCurrent = useMemo(() => computeKpis(current), [current]);
  const kpisPrior = useMemo(() => (compare ? computeKpis(prior) : null), [prior, compare]);

  const buckets = useMemo(() => enumerateBuckets(from, to, granularity), [from, to, granularity]);

  const volumeData = useMemo(() => {
    const map = new Map<string, { delivered: number; cancelled: number; inFlight: number }>();
    for (const k of buckets) map.set(k, { delivered: 0, cancelled: 0, inFlight: 0 });
    for (const o of current) {
      const k = bucketKey(new Date(o.createdAt), granularity);
      const row = map.get(k);
      if (!row) continue;
      if (o.stage === "DELIVERED") row.delivered++;
      else if (o.stage === "CANCELLED") row.cancelled++;
      else row.inFlight++;
    }
    let priorMap: Map<string, number> | null = null;
    if (compare) {
      priorMap = new Map();
      const r = priorRange(from, to);
      const priorBuckets = enumerateBuckets(r.from, r.to, granularity);
      for (const k of priorBuckets) priorMap.set(k, 0);
      for (const o of prior) {
        const k = bucketKey(new Date(o.createdAt), granularity);
        priorMap.set(k, (priorMap.get(k) ?? 0) + 1);
      }
    }
    const priorBuckets = priorMap ? Array.from(priorMap.keys()) : [];
    return buckets.map((k, i) => {
      const row = map.get(k)!;
      const out: Record<string, number | string> = {
        bucket: bucketLabel(k, granularity),
        delivered: row.delivered,
        cancelled: row.cancelled,
        inFlight: row.inFlight,
      };
      if (priorMap) {
        const pk = priorBuckets[i];
        if (pk !== undefined) out.priorTotal = priorMap.get(pk) ?? 0;
      }
      return out;
    });
  }, [current, prior, buckets, granularity, compare, from, to]);

  const funnel = useMemo(() => computeFunnel(currentForFunnel), [currentForFunnel]);

  const explorer = useMemo(
    () =>
      computeBreakdown(current, {
        rowDim: explorerRow,
        colDim: explorerCol,
        metric: explorerMetric,
        granularity,
        equipMeta,
        companyLabel,
        insuranceLabel,
        bucketsForRange: buckets,
      }),
    [current, explorerRow, explorerCol, explorerMetric, granularity, equipMeta, companyLabel, insuranceLabel, buckets],
  );

  const topFacilities = useMemo(() => computeTopFacilities(current), [current]);

  return (
    <div className="px-4 py-5 md:px-10 md:py-8" style={{ background: PAGE_BG, minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: DARK, margin: 0, lineHeight: 1.2 }}>Reporting</h1>
          <p style={{ fontSize: 14, color: MUTED, margin: "4px 0 0" }}>
            Volume, pipeline, and breakdowns across the current filters.
          </p>
        </div>
      </div>

      <TimeControls
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onPreset={applyPreset}
        granularity={granularity}
        onGranularityChange={setGranularity}
        compare={compare}
        onCompareChange={setCompare}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          padding: "10px 14px",
          background: PANEL_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.04em" }}>Filters</span>
        <MultiChip label="Facility" options={filterOptions.facilities} selected={filters.facilities} onChange={(s) => setFilterField("facilities", s)} />
        <MultiChip label="Dispatcher" options={filterOptions.dispatchers} selected={filters.dispatchers} onChange={(s) => setFilterField("dispatchers", s)} />
        <MultiChip label="Company" options={filterOptions.companies} selected={filters.companies} onChange={(s) => setFilterField("companies", s)} />
        <MultiChip label="Insurance" options={filterOptions.insurance} selected={filters.insurance} onChange={(s) => setFilterField("insurance", s)} />
        <MultiChip label="Category" options={filterOptions.categories} selected={filters.categories} onChange={(s) => setFilterField("categories", s)} />
        <MultiChip label="Stage" options={filterOptions.stages} selected={filters.stages} onChange={(s) => setFilterField("stages", s)} />
        <MultiChip label="Status" options={filterOptions.statuses} selected={filters.statuses} onChange={(s) => setFilterField("statuses", s)} />
        {totalActiveFilters(filters) > 0 && (
          <button onClick={() => setFilters(emptyFilters())} style={resetBtnStyle}>
            <X size={12} />
            Reset
          </button>
        )}
        {totalActiveFilters(filters) > 0 && (
          <ActiveFilterChips
            filters={filters}
            onRemove={(key, value) => {
              setFilters((prev) => {
                const next = new Set(prev[key]);
                next.delete(value);
                return { ...prev, [key]: next };
              });
            }}
            insuranceLabel={insuranceLabel}
            companyLabel={companyLabel}
          />
        )}
      </div>

      <KpiStrip current={kpisCurrent} prior={kpisPrior} />

      <VolumeCard data={volumeData} compare={compare} />

      <FunnelCard funnel={funnel} />

      <ExplorerCard
        rowDim={explorerRow}
        colDim={explorerCol}
        metric={explorerMetric}
        onRowChange={setExplorerRow}
        onColChange={setExplorerCol}
        onMetricChange={setExplorerMetric}
        onPreset={applyExplorerPreset}
        data={explorer}
        onDrillRow={(rowKey, rowLabel) => addToFilters(setFilters, explorerRow, rowKey, rowLabel)}
      />

      <TopFacilitiesCard
        rows={topFacilities}
        onDrill={(facility) => {
          if (facility === "Unassigned") return;
          setFilters((prev) => {
            const next = new Set(prev.facilities);
            next.add(facility);
            return { ...prev, facilities: next };
          });
        }}
      />

      {current.length === 0 && (
        <div
          style={{
            background: PANEL_BG,
            border: `1px dashed ${BORDER}`,
            borderRadius: 8,
            padding: 32,
            textAlign: "center",
            color: MUTED,
            fontSize: 14,
          }}
        >
          No orders match the current filters.
        </div>
      )}
    </div>
  );
}

type Kpis = {
  total: number;
  delivered: number;
  cancelled: number;
  inFlight: number;
  units: number;
  avgHours: number;
};

function computeKpis(orders: OrderShape[]): Kpis {
  let delivered = 0;
  let cancelled = 0;
  let inFlight = 0;
  let units = 0;
  let totalHrs = 0;
  let withDates = 0;
  for (const o of orders) {
    if (o.stage === "DELIVERED") delivered++;
    else if (o.stage === "CANCELLED") cancelled++;
    else inFlight++;
    for (const it of o.items) units += it.quantity;
    const ed = effectiveDeliveredAt(o);
    if (ed) {
      const ms = new Date(ed).getTime() - new Date(o.createdAt).getTime();
      if (ms > 0) {
        totalHrs += ms / 36e5;
        withDates++;
      }
    }
  }
  return {
    total: orders.length,
    delivered,
    cancelled,
    inFlight,
    units,
    avgHours: withDates ? totalHrs / withDates : 0,
  };
}

type FunnelStage = {
  key: string;
  label: string;
  count: number;
  pctOfStart: number;
  conversionFromPrev: number;
  medianFromPrev: number | null;
  cancelled: number;
};

function computeFunnel(orders: OrderShape[]): { stages: FunnelStage[]; cancelled: number; cancelRate: number } {
  let submitted = 0;
  let printed = 0;
  let acknowledged = 0;
  let outForDelivery = 0;
  let delivered = 0;
  let cancelled = 0;

  // Cancellations bucketed by the last stage reached before exit.
  const cancelByStage: Record<string, number> = { submitted: 0, printed: 0, acknowledged: 0, ofd: 0, delivered: 0 };

  const printedHrs: number[] = [];
  const ackHrs: number[] = [];
  const ofdHrs: number[] = [];
  const delHrs: number[] = [];

  for (const o of orders) {
    submitted++;
    const isCancelled = !!o.cancelledAt || o.stage === "CANCELLED";
    if (isCancelled) cancelled++;
    const created = new Date(o.createdAt).getTime();
    if (o.printedAt) {
      printed++;
      printedHrs.push((new Date(o.printedAt).getTime() - created) / 36e5);
    }
    if (o.acknowledgedAt) {
      acknowledged++;
      if (o.printedAt) {
        ackHrs.push((new Date(o.acknowledgedAt).getTime() - new Date(o.printedAt).getTime()) / 36e5);
      }
    }
    if (o.outForDeliveryAt) {
      outForDelivery++;
      if (o.acknowledgedAt) {
        ofdHrs.push((new Date(o.outForDeliveryAt).getTime() - new Date(o.acknowledgedAt).getTime()) / 36e5);
      }
    }
    const ed = effectiveDeliveredAt(o);
    if (ed) {
      delivered++;
      if (o.outForDeliveryAt) {
        delHrs.push((new Date(ed).getTime() - new Date(o.outForDeliveryAt).getTime()) / 36e5);
      }
    }
    if (isCancelled) {
      const lastStage = ed
        ? "delivered"
        : o.outForDeliveryAt
          ? "ofd"
          : o.acknowledgedAt
            ? "acknowledged"
            : o.printedAt
              ? "printed"
              : "submitted";
      cancelByStage[lastStage]++;
    }
  }

  const stages: FunnelStage[] = [
    { key: "submitted",    label: "Submitted",        count: submitted,      pctOfStart: 1,                                       conversionFromPrev: 1,                              medianFromPrev: null,                                cancelled: cancelByStage.submitted },
    { key: "printed",      label: "Printed",          count: printed,        pctOfStart: submitted ? printed / submitted : 0,    conversionFromPrev: submitted ? printed / submitted : 0,         medianFromPrev: printedHrs.length ? median(printedHrs) : null, cancelled: cancelByStage.printed },
    { key: "acknowledged", label: "Acknowledged",     count: acknowledged,   pctOfStart: submitted ? acknowledged / submitted : 0, conversionFromPrev: printed ? acknowledged / printed : 0,        medianFromPrev: ackHrs.length ? median(ackHrs) : null,         cancelled: cancelByStage.acknowledged },
    { key: "ofd",          label: "Out for Delivery", count: outForDelivery, pctOfStart: submitted ? outForDelivery / submitted : 0, conversionFromPrev: acknowledged ? outForDelivery / acknowledged : 0, medianFromPrev: ofdHrs.length ? median(ofdHrs) : null,    cancelled: cancelByStage.ofd },
    { key: "delivered",    label: "Delivered",        count: delivered,      pctOfStart: submitted ? delivered / submitted : 0,  conversionFromPrev: outForDelivery ? delivered / outForDelivery : 0, medianFromPrev: delHrs.length ? median(delHrs) : null,    cancelled: cancelByStage.delivered },
  ];

  return { stages, cancelled, cancelRate: submitted ? cancelled / submitted : 0 };
}

type BreakdownData = {
  rowKeys: string[];
  rowLabels: string[];
  colKeys: string[];
  colLabels: string[];
  cells: number[][];
  rowTotals: number[];
  colTotals: number[];
  metric: Metric;
};

type BreakdownArgs = {
  rowDim: Dimension;
  colDim: Dimension | "none";
  metric: Metric;
  granularity: Granularity;
  equipMeta: Map<string, { category: string; abbreviation: string; name: string }>;
  companyLabel: Map<string, string>;
  insuranceLabel: Map<string, string>;
  bucketsForRange: string[];
};

type Contribution = { rowKey: string; rowLabel: string; weight: number };

// Bucket a continuous deductible dollar amount into stable, ordered ranges so it
// works as a pivot dimension (an exact-dollar pivot would be all but useless).
function deductibleBucket(amt: number | null): { key: string; label: string } {
  if (amt == null) return { key: "unset", label: "Not recorded" };
  if (amt <= 0) return { key: "0", label: "$0 (met)" };
  if (amt < 500) return { key: "1", label: "$1–499" };
  if (amt < 1000) return { key: "2", label: "$500–999" };
  if (amt < 2500) return { key: "3", label: "$1,000–2,499" };
  return { key: "4", label: "$2,500+" };
}

function rowContributions(o: OrderShape, dim: Dimension, args: BreakdownArgs): Contribution[] {
  switch (dim) {
    case "facility":
      return [{ rowKey: o.facilityName ?? "Unassigned", rowLabel: o.facilityName ?? "Unassigned", weight: 1 }];
    case "driver":
      return [{ rowKey: driverDisplay(o) ?? "Unassigned", rowLabel: driverDisplay(o) ?? "Unassigned", weight: 1 }];
    case "company":
      if (o.fulfillmentCompanies.length === 0) {
        return [{ rowKey: "Unassigned", rowLabel: "Unassigned", weight: 1 }];
      }
      return o.fulfillmentCompanies.map((k) => ({
        rowKey: k,
        rowLabel: args.companyLabel.get(k) ?? k,
        weight: 1,
      }));
    case "insurance": {
      const k = o.primaryInsuranceKey ?? "Unassigned";
      return [{ rowKey: k, rowLabel: k === "Unassigned" ? "Unassigned" : args.insuranceLabel.get(k) ?? k, weight: 1 }];
    }
    case "category": {
      const seen = new Map<string, number>();
      for (const it of o.items) {
        const cat = args.equipMeta.get(it.equipmentId)?.category ?? it.category ?? "Other";
        seen.set(cat, (seen.get(cat) ?? 0) + it.quantity);
      }
      if (seen.size === 0) return [];
      return Array.from(seen.entries()).map(([rowKey, qty]) => ({ rowKey, rowLabel: rowKey, weight: qty }));
    }
    case "item": {
      const seen = new Map<string, { label: string; qty: number }>();
      for (const it of o.items) {
        const meta = args.equipMeta.get(it.equipmentId);
        const key = (meta?.abbreviation || it.abbreviation || it.name || "Other").toUpperCase();
        const label = meta?.name ?? it.name ?? key;
        const cur = seen.get(key) ?? { label, qty: 0 };
        cur.qty += it.quantity;
        seen.set(key, cur);
      }
      if (seen.size === 0) return [];
      return Array.from(seen.entries()).map(([rowKey, v]) => ({ rowKey, rowLabel: v.label, weight: v.qty }));
    }
    case "stage":
      return [{ rowKey: o.stage, rowLabel: STAGE_LABELS[o.stage] ?? o.stage, weight: 1 }];
    case "status":
      return [{ rowKey: o.status, rowLabel: STATUS_LABELS[o.status] ?? o.status, weight: 1 }];
    case "coinsurance": {
      const p = o.coinsurancePct;
      return [{ rowKey: p == null ? "unset" : String(p), rowLabel: p == null ? "Not recorded" : `${p}%`, weight: 1 }];
    }
    case "deductible": {
      const b = deductibleBucket(o.deductibleAmount);
      return [{ rowKey: b.key, rowLabel: b.label, weight: 1 }];
    }
    case "dow": {
      const d = new Date(o.createdAt).getDay();
      return [{ rowKey: String(d), rowLabel: DOW_LABELS[d], weight: 1 }];
    }
    case "time": {
      const k = bucketKey(new Date(o.createdAt), args.granularity);
      return [{ rowKey: k, rowLabel: bucketLabel(k, args.granularity), weight: 1 }];
    }
  }
}

function computeBreakdown(orders: OrderShape[], args: BreakdownArgs): BreakdownData {
  const rowMap = new Map<string, string>();
  const colMap = new Map<string, string>();

  type Acc = { count: number; weight: number; delivered: number; cancelled: number; hrs: number; hrsCount: number };
  const cells = new Map<string, Map<string, Acc>>();

  for (const o of orders) {
    const rowContribs = rowContributions(o, args.rowDim, args);
    const colContribs = args.colDim === "none"
      ? [{ rowKey: "__all__", rowLabel: "All", weight: 1 }]
      : rowContributions(o, args.colDim, args);
    if (rowContribs.length === 0 || colContribs.length === 0) continue;
    let hrs = 0;
    let hasHrs = false;
    const ed = effectiveDeliveredAt(o);
    if (ed) {
      const ms = new Date(ed).getTime() - new Date(o.createdAt).getTime();
      if (ms > 0) {
        hrs = ms / 36e5;
        hasHrs = true;
      }
    }
    const isDelivered = o.stage === "DELIVERED";
    const isCancelled = o.stage === "CANCELLED";
    for (const r of rowContribs) {
      rowMap.set(r.rowKey, r.rowLabel);
      const rowCells = cells.get(r.rowKey) ?? new Map<string, Acc>();
      for (const c of colContribs) {
        colMap.set(c.rowKey, c.rowLabel);
        const acc = rowCells.get(c.rowKey) ?? { count: 0, weight: 0, delivered: 0, cancelled: 0, hrs: 0, hrsCount: 0 };
        acc.count += 1;
        acc.weight += r.weight;
        if (isDelivered) acc.delivered += 1;
        if (isCancelled) acc.cancelled += 1;
        if (hasHrs) {
          acc.hrs += hrs;
          acc.hrsCount += 1;
        }
        rowCells.set(c.rowKey, acc);
      }
      cells.set(r.rowKey, rowCells);
    }
  }

  const colKeys = sortColKeys(args, colMap);
  const colLabels = colKeys.map((k) => colMap.get(k) ?? k);

  const rowKeys = sortRowKeys(args, rowMap, cells, colKeys);
  const rowLabels = rowKeys.map((k) => rowMap.get(k) ?? k);

  const grid: number[][] = [];
  const rowTotals: number[] = [];
  const colTotals = new Array(colKeys.length).fill(0);

  for (const rk of rowKeys) {
    const row: number[] = [];
    let rowTotal = 0;
    const rowAccs = cells.get(rk);
    let rowCount = 0;
    let rowDelivered = 0;
    let rowCancelled = 0;
    let rowHrs = 0;
    let rowHrsCount = 0;
    for (let i = 0; i < colKeys.length; i++) {
      const acc = rowAccs?.get(colKeys[i]);
      const v = acc ? metricValue(acc, args.metric) : 0;
      row.push(v);
      colTotals[i] += v;
      rowTotal += v;
      if (acc) {
        rowCount += acc.count;
        rowDelivered += acc.delivered;
        rowCancelled += acc.cancelled;
        rowHrs += acc.hrs;
        rowHrsCount += acc.hrsCount;
      }
    }
    if (args.metric === "avgHours") {
      rowTotals.push(rowHrsCount ? rowHrs / rowHrsCount : 0);
    } else if (args.metric === "cancelRate") {
      rowTotals.push(rowCount ? rowCancelled / rowCount : 0);
    } else {
      rowTotals.push(rowTotal);
    }
    grid.push(row);
  }

  return {
    rowKeys,
    rowLabels,
    colKeys,
    colLabels,
    cells: grid,
    rowTotals,
    colTotals,
    metric: args.metric,
  };
}

function metricValue(acc: { count: number; weight: number; delivered: number; cancelled: number; hrs: number; hrsCount: number }, metric: Metric): number {
  switch (metric) {
    case "orders":
      return acc.count;
    case "units":
      return acc.weight;
    case "delivered":
      return acc.delivered;
    case "cancelled":
      return acc.cancelled;
    case "avgHours":
      return acc.hrsCount ? acc.hrs / acc.hrsCount : 0;
    case "cancelRate":
      return acc.count ? acc.cancelled / acc.count : 0;
  }
}

function sortColKeys(args: BreakdownArgs, colMap: Map<string, string>): string[] {
  const keys = Array.from(colMap.keys());
  if (args.colDim === "none") return keys;
  if (args.colDim === "time") {
    return keys.sort();
  }
  if (args.colDim === "dow") {
    return keys.sort((a, b) => Number(a) - Number(b));
  }
  if (args.colDim === "stage") {
    const order = Object.keys(STAGE_LABELS);
    return keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  if (args.colDim === "status") {
    const order = Object.keys(STATUS_LABELS);
    return keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  if (args.colDim === "coinsurance" || args.colDim === "deductible") {
    const n = (k: string) => (k === "unset" ? Infinity : Number(k));
    return keys.sort((a, b) => n(a) - n(b));
  }
  return keys.sort((a, b) => (colMap.get(a) ?? a).localeCompare(colMap.get(b) ?? b));
}

function sortRowKeys(
  args: BreakdownArgs,
  rowMap: Map<string, string>,
  cells: Map<string, Map<string, { count: number; weight: number; delivered: number; cancelled: number; hrs: number; hrsCount: number }>>,
  colKeys: string[],
): string[] {
  const keys = Array.from(rowMap.keys());
  if (args.rowDim === "time") return keys.sort();
  if (args.rowDim === "dow") return keys.sort((a, b) => Number(a) - Number(b));
  if (args.rowDim === "stage") {
    const order = Object.keys(STAGE_LABELS);
    return keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  if (args.rowDim === "status") {
    const order = Object.keys(STATUS_LABELS);
    return keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  if (args.rowDim === "coinsurance" || args.rowDim === "deductible") {
    const n = (k: string) => (k === "unset" ? Infinity : Number(k));
    return keys.sort((a, b) => n(a) - n(b));
  }
  const rowTotals = new Map<string, number>();
  for (const k of keys) {
    const row = cells.get(k);
    let t = 0;
    if (row) {
      for (const ck of colKeys) {
        const acc = row.get(ck);
        if (acc) t += acc.count;
      }
    }
    rowTotals.set(k, t);
  }
  return keys.sort((a, b) => (rowTotals.get(b) ?? 0) - (rowTotals.get(a) ?? 0));
}

type FacilityRow = {
  facility: string;
  orders: number;
  delivered: number;
  cancelled: number;
  cancelRate: number;
  avgHours: number;
  units: number;
};

function computeTopFacilities(orders: OrderShape[]): FacilityRow[] {
  const map = new Map<string, FacilityRow & { hrs: number; hrsCount: number }>();
  for (const o of orders) {
    const facility = o.facilityName ?? "Unassigned";
    const cur = map.get(facility) ?? {
      facility,
      orders: 0,
      delivered: 0,
      cancelled: 0,
      cancelRate: 0,
      avgHours: 0,
      units: 0,
      hrs: 0,
      hrsCount: 0,
    };
    cur.orders++;
    if (o.stage === "DELIVERED") cur.delivered++;
    if (o.stage === "CANCELLED") cur.cancelled++;
    for (const it of o.items) cur.units += it.quantity;
    const ed = effectiveDeliveredAt(o);
    if (ed) {
      const ms = new Date(ed).getTime() - new Date(o.createdAt).getTime();
      if (ms > 0) {
        cur.hrs += ms / 36e5;
        cur.hrsCount++;
      }
    }
    map.set(facility, cur);
  }
  return Array.from(map.values())
    .map((r) => ({
      facility: r.facility,
      orders: r.orders,
      delivered: r.delivered,
      cancelled: r.cancelled,
      cancelRate: r.orders ? r.cancelled / r.orders : 0,
      avgHours: r.hrsCount ? r.hrs / r.hrsCount : 0,
      units: r.units,
    }))
    .sort((a, b) => b.orders - a.orders);
}

function addToFilters(
  setFilters: React.Dispatch<React.SetStateAction<Filters>>,
  dim: Dimension,
  rowKey: string,
  rowLabel: string,
) {
  const target: keyof Filters | null =
    dim === "facility"   ? "facilities" :
    dim === "driver"     ? "dispatchers" :
    dim === "company"    ? "companies" :
    dim === "insurance"  ? "insurance" :
    dim === "category"   ? "categories" :
    dim === "stage"      ? "stages" :
    dim === "status"     ? "statuses" :
    null;
  if (!target) return;
  const value = target === "facilities" || target === "dispatchers" || target === "categories" ? rowLabel : rowKey;
  if (!value || value === "Unassigned") return;
  setFilters((prev) => {
    const next = new Set(prev[target]);
    next.add(value);
    return { ...prev, [target]: next };
  });
}

function TimeControls({
  from,
  to,
  onFromChange,
  onToChange,
  onPreset,
  granularity,
  onGranularityChange,
  compare,
  onCompareChange,
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onPreset: (key: PresetKey) => void;
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
  compare: boolean;
  onCompareChange: (v: boolean) => void;
}) {
  const active = activePreset(from, to);
  let priorLabel: string | null = null;
  if (compare && from && to) {
    const r = priorRange(from, to);
    priorLabel = formatRangeLabel(r.from, r.to);
  }
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
        padding: "10px 14px",
        background: PANEL_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        marginBottom: 12,
      }}
    >
      <div style={{ display: "inline-flex", border: `1px solid ${BORDER}`, borderRadius: 6, overflow: "hidden", background: PANEL_BG }}>
        {RANGE_PRESETS.map((p, i, arr) => {
          const isActive = active === p.key;
          return (
            <button
              key={p.key}
              onClick={() => onPreset(p.key)}
              style={{
                padding: "6px 10px",
                fontSize: 12,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? "#ffffff" : BODY,
                background: isActive ? PRIMARY : PANEL_BG,
                borderRight: i < arr.length - 1 ? `1px solid ${BORDER}` : "none",
                cursor: "pointer",
                border: "none",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <DateInput label="From" value={from} onChange={onFromChange} />
      <DateInput label="To" value={to} onChange={onToChange} />
      <div style={{ width: 1, height: 22, background: BORDER }} />
      <span style={{ fontSize: 12, color: MUTED }}>Granularity</span>
      <SegmentedControl
        options={GRANULARITY_OPTIONS}
        value={granularity}
        onChange={onGranularityChange}
      />
      <div style={{ width: 1, height: 22, background: BORDER }} />
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: MUTED, cursor: "pointer" }}>
        <input type="checkbox" checked={compare} onChange={(e) => onCompareChange(e.target.checked)} />
        Compare to prior period
      </label>
      {priorLabel && (
        <span style={{ fontSize: 11, color: MUTED, fontFeatureSettings: '"tnum"' }}>
          vs {priorLabel}
        </span>
      )}
    </div>
  );
}

function KpiStrip({ current, prior }: { current: Kpis; prior: Kpis | null }) {
  const cards: Array<{ label: string; value: string; delta?: ReturnType<typeof formatDelta>; tone?: "good" | "bad" | "neutral" }> = [
    {
      label: "Total orders",
      value: current.total.toLocaleString(),
      delta: prior ? formatDelta(current.total, prior.total) : undefined,
      tone: "neutral",
    },
    {
      label: "Delivered",
      value: current.delivered.toLocaleString(),
      delta: prior ? formatDelta(current.delivered, prior.delivered) : undefined,
      tone: "good",
    },
    {
      label: "Cancelled",
      value: current.cancelled.toLocaleString(),
      delta: prior ? formatDelta(current.cancelled, prior.cancelled) : undefined,
      tone: "bad",
    },
    {
      label: "In flight",
      value: current.inFlight.toLocaleString(),
      delta: prior ? formatDelta(current.inFlight, prior.inFlight) : undefined,
      tone: "neutral",
    },
    {
      label: "Units shipped",
      value: current.units.toLocaleString(),
      delta: prior ? formatDelta(current.units, prior.units) : undefined,
      tone: "neutral",
    },
    {
      label: "Avg fulfillment",
      value: current.avgHours ? formatHours(current.avgHours) : "—",
      delta: prior ? formatDelta(current.avgHours, prior.avgHours) : undefined,
      tone: "bad",
    },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 12,
        marginBottom: 20,
      }}
    >
      {cards.map((c) => (
        <KPICard key={c.label} label={c.label} value={c.value} delta={c.delta} tone={c.tone ?? "neutral"} />
      ))}
    </div>
  );
}

function KPICard({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta?: { text: string; dir: "up" | "down" | "flat" };
  tone: "good" | "bad" | "neutral";
}) {
  const deltaColor = delta
    ? delta.dir === "flat"
      ? MUTED
      : tone === "bad"
        ? delta.dir === "up"
          ? COLOR_CANCELLED
          : COLOR_DELIVERED
        : tone === "good"
          ? delta.dir === "up"
            ? COLOR_DELIVERED
            : COLOR_CANCELLED
          : delta.dir === "up"
            ? COLOR_DELIVERED
            : COLOR_CANCELLED
    : MUTED;
  const Icon = delta ? (delta.dir === "up" ? ArrowUpRight : delta.dir === "down" ? ArrowDownRight : Minus) : Minus;
  return (
    <div style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: DARK, lineHeight: 1.1 }}>{value}</div>
        {delta && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, color: deltaColor, fontWeight: 600 }}>
            <Icon size={12} />
            {delta.text}
          </span>
        )}
      </div>
    </div>
  );
}

function VolumeCard({ data, compare }: { data: Array<Record<string, number | string>>; compare: boolean }) {
  return (
    <Card title="Order volume" subtitle="Stacked by outcome on the order's create date.">
      {data.length === 0 ? (
        <Empty message="No data for the selected range." />
      ) : (
        <div style={{ padding: "8px 12px 12px", height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={BORDER} vertical={false} />
              <XAxis dataKey="bucket" stroke={MUTED} fontSize={11} tickLine={false} />
              <YAxis stroke={MUTED} fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip content={<VolumeTooltip />} cursor={{ stroke: BORDER, strokeWidth: 1 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="delivered" name="Delivered" stackId="1" stroke={COLOR_DELIVERED} fill={COLOR_DELIVERED} fillOpacity={0.25} />
              <Area type="monotone" dataKey="inFlight" name="In flight" stackId="1" stroke={COLOR_INFLIGHT} fill={COLOR_INFLIGHT} fillOpacity={0.25} />
              <Area type="monotone" dataKey="cancelled" name="Cancelled" stackId="1" stroke={COLOR_CANCELLED} fill={COLOR_CANCELLED} fillOpacity={0.25} />
              {compare && (
                <Line type="monotone" dataKey="priorTotal" name="Prior period (total)" stroke={MUTED} strokeDasharray="4 4" dot={false} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

type TooltipPayloadEntry = { name?: string; dataKey?: string; value?: number; color?: string };
function VolumeTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const ordered = ["delivered", "inFlight", "cancelled", "priorTotal"];
  const sorted = [...payload].sort(
    (a, b) => ordered.indexOf(String(a.dataKey)) - ordered.indexOf(String(b.dataKey)),
  );
  const total = payload
    .filter((p) => p.dataKey !== "priorTotal")
    .reduce((sum, p) => sum + (typeof p.value === "number" ? p.value : 0), 0);
  return (
    <div
      style={{
        background: "#ffffff",
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        padding: "8px 10px",
        boxShadow: "rgba(50,50,93,0.15) 0px 13px 27px -5px",
        fontSize: 12,
        minWidth: 160,
      }}
    >
      <div style={{ color: DARK, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {sorted.map((p) => (
        <div key={String(p.dataKey)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: MUTED }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
            {p.name}
          </span>
          <span style={{ color: DARK, fontFeatureSettings: '"tnum"' }}>
            {(typeof p.value === "number" ? p.value : 0).toLocaleString()}
          </span>
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 4, paddingTop: 4, display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: MUTED }}>Total</span>
        <span style={{ color: DARK, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{total.toLocaleString()}</span>
      </div>
    </div>
  );
}

function FunnelCard({ funnel }: { funnel: { stages: FunnelStage[]; cancelled: number; cancelRate: number } }) {
  const max = funnel.stages[0]?.count ?? 1;
  return (
    <Card
      title="Pipeline funnel"
      subtitle={`Conversion through stages and median time between them. Cancelled orders shown as side-exit.`}
      right={
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: MUTED }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: COLOR_CANCELLED }} />
          Cancelled: {funnel.cancelled} ({formatPct(funnel.cancelRate)})
        </div>
      }
    >
      {funnel.stages[0]?.count === 0 ? (
        <Empty message="No orders in this range." />
      ) : (
        <div style={{ padding: "12px 16px 16px" }}>
          {funnel.stages.map((s, i) => {
            const widthPct = max ? (s.count / max) * 100 : 0;
            const cancelPct = max ? (s.cancelled / max) * 100 : 0;
            return (
              <div key={s.key} style={{ marginBottom: i === funnel.stages.length - 1 ? 0 : 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{s.label}</span>
                    <span style={{ fontSize: 12, color: MUTED }}>{s.count.toLocaleString()}</span>
                    <span style={{ fontSize: 11, color: MUTED }}>({formatPct(s.pctOfStart)} of submitted)</span>
                  </div>
                  <div style={{ display: "inline-flex", gap: 12, fontSize: 11, color: MUTED }}>
                    {s.cancelled > 0 && (
                      <span style={{ color: COLOR_CANCELLED, fontWeight: 500 }}>
                        ↳ {s.cancelled.toLocaleString()} cancelled here
                      </span>
                    )}
                    {i > 0 && <span>conv {formatPct(s.conversionFromPrev)}</span>}
                    {s.medianFromPrev !== null && <span>median {formatHours(s.medianFromPrev)}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", height: 10, background: "#eef2f7", borderRadius: 5, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${widthPct}%`,
                      height: "100%",
                      background: PRIMARY,
                      opacity: 0.3 + 0.7 * (s.count / max),
                    }}
                  />
                  {cancelPct > 0 && (
                    <div
                      style={{
                        width: `${cancelPct}%`,
                        height: "100%",
                        background: COLOR_CANCELLED,
                        opacity: 0.6,
                      }}
                      title={`${s.cancelled} cancelled at ${s.label}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ExplorerCard({
  rowDim,
  colDim,
  metric,
  onRowChange,
  onColChange,
  onMetricChange,
  onPreset,
  data,
  onDrillRow,
}: {
  rowDim: Dimension;
  colDim: Dimension | "none";
  metric: Metric;
  onRowChange: (d: Dimension) => void;
  onColChange: (d: Dimension | "none") => void;
  onMetricChange: (m: Metric) => void;
  onPreset: (p: (typeof PRESETS)[number]) => void;
  data: BreakdownData;
  onDrillRow: (rowKey: string, rowLabel: string) => void;
}) {
  function handleExport() {
    const csv: Array<Array<string | number>> = [];
    const colHeader = data.colLabels.length === 1 && data.colLabels[0] === "All" ? [METRIC_OPTIONS.find((m) => m.value === metric)?.label ?? "Value"] : data.colLabels;
    csv.push([DIMENSION_OPTIONS.find((d) => d.value === rowDim)?.label ?? "Row", ...colHeader]);
    for (let i = 0; i < data.rowLabels.length; i++) {
      csv.push([data.rowLabels[i], ...data.cells[i].map((v) => formatMetricForCsv(v, metric))]);
    }
    downloadCsv(`breakdown-${rowDim}-${colDim}-${metric}`, csv);
  }
  const hasData = data.rowLabels.length > 0;
  return (
    <Card
      title="Breakdown explorer"
      subtitle="Pivot the filtered orders by any two dimensions."
      right={
        hasData ? (
          <button onClick={handleExport} style={exportBtnStyle}>
            <Download size={14} />
            Export CSV
          </button>
        ) : null
      }
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", padding: "12px 16px", borderBottom: `1px solid ${BORDER}` }}>
        <Field label="Rows">
          <Select value={rowDim} onChange={(v) => onRowChange(v as Dimension)} options={DIMENSION_OPTIONS} />
        </Field>
        <Field label="Columns">
          <Select
            value={colDim}
            onChange={(v) => onColChange(v as Dimension | "none")}
            options={[{ value: "none", label: "None (single column)" }, ...DIMENSION_OPTIONS.filter((d) => d.value !== rowDim)]}
          />
        </Field>
        <Field label="Metric">
          <Select value={metric} onChange={(v) => onMetricChange(v as Metric)} options={METRIC_OPTIONS} />
        </Field>
        <div style={{ display: "inline-flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => onPreset(p)} style={presetBtnStyle}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {!hasData ? (
        <Empty message="No data for this combination." />
      ) : (
        <ExplorerTable
          data={data}
          rowDim={rowDim}
          rowDimLabel={DIMENSION_OPTIONS.find((d) => d.value === rowDim)?.label ?? "Row"}
          onDrillRow={onDrillRow}
        />
      )}
    </Card>
  );
}

const DRILL_DIMS: ReadonlyArray<Dimension> = ["facility", "driver", "company", "insurance", "category", "stage", "status"];

function ExplorerTable({
  data,
  rowDim,
  rowDimLabel,
  onDrillRow,
}: {
  data: BreakdownData;
  rowDim: Dimension;
  rowDimLabel: string;
  onDrillRow: (rowKey: string, rowLabel: string) => void;
}) {
  const drillable = DRILL_DIMS.includes(rowDim);
  const showColTotals = data.colLabels.length > 1 && (data.metric === "orders" || data.metric === "units" || data.metric === "delivered" || data.metric === "cancelled");
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={{ ...thStyle, ...firstColStyle }}>{rowDimLabel}</th>
            {data.colLabels.map((c) => (
              <th key={c} style={{ ...thStyle, textAlign: "center" }}>
                {c}
              </th>
            ))}
            {data.colLabels.length > 1 && (
              <th style={{ ...thStyle, textAlign: "center", color: PRIMARY }}>{rowSummaryHeader(data.metric)}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.rowLabels.map((label, i) => {
            const rowKey = data.rowKeys[i];
            const canDrill = drillable && label !== "Unassigned";
            return (
            <tr key={label}>
              <td style={{ ...tdStyle, ...firstColTdStyle }}>
                {canDrill ? (
                  <button
                    type="button"
                    onClick={() => onDrillRow(rowKey, label)}
                    style={{ background: "transparent", border: "none", padding: 0, color: PRIMARY, cursor: "pointer", fontWeight: 500 }}
                    title="Add to filters"
                  >
                    {label}
                  </button>
                ) : (
                  label
                )}
              </td>
              {data.cells[i].map((v, j) => (
                <td key={j} style={{ ...tdStyle, color: v === 0 ? "#cbd5e0" : BODY, textAlign: "center" }}>
                  {formatCell(v, data.metric)}
                </td>
              ))}
              {data.colLabels.length > 1 && (
                <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600, color: PRIMARY }}>
                  {formatCell(data.rowTotals[i], data.metric)}
                </td>
              )}
            </tr>
            );
          })}
          {showColTotals && (
            <tr>
              <td style={{ ...tdStyle, ...firstColTdStyle, fontWeight: 600 }}>Total</td>
              {data.colTotals.map((v, j) => (
                <td key={j} style={{ ...tdStyle, textAlign: "center", fontWeight: 600, background: "#f6f9fc" }}>
                  {formatCell(v, data.metric)}
                </td>
              ))}
              <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: PRIMARY, background: PRIMARY_BG }}>
                {formatCell(data.rowTotals.reduce((a, b) => a + b, 0), data.metric)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function rowSummaryHeader(metric: Metric): string {
  if (metric === "avgHours") return "Avg";
  if (metric === "cancelRate") return "Rate";
  return "Total";
}

function formatCell(v: number, metric: Metric): string {
  if (v === 0 && metric !== "avgHours" && metric !== "cancelRate") return "—";
  if (metric === "avgHours") return formatHours(v);
  if (metric === "cancelRate") return formatPct(v);
  return v.toLocaleString();
}

function formatMetricForCsv(v: number, metric: Metric): string | number {
  if (metric === "avgHours") return v.toFixed(1);
  if (metric === "cancelRate") return (v * 100).toFixed(1);
  return v;
}

function TopFacilitiesCard({ rows, onDrill }: { rows: FacilityRow[]; onDrill: (facility: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const visibleRows = showAll ? rows : rows.slice(0, 10);
  const hasMore = rows.length > 10;

  function handleExport() {
    const csv: Array<Array<string | number>> = [];
    csv.push(["Facility", "Orders", "Delivered", "Cancelled", "Cancel rate", "Avg fulfillment (hrs)", "Units"]);
    for (const r of rows) {
      csv.push([
        r.facility,
        r.orders,
        r.delivered,
        r.cancelled,
        (r.cancelRate * 100).toFixed(1),
        r.avgHours.toFixed(1),
        r.units,
      ]);
    }
    downloadCsv("top-facilities", csv);
  }
  return (
    <Card
      title={showAll ? `All facilities (${rows.length})` : "Top facilities"}
      subtitle={showAll ? "All facilities with activity in this range. Click a row to filter." : "Top 10 by volume. Click a row to filter."}
      right={
        rows.length > 0 ? (
          <div style={{ display: "inline-flex", gap: 8 }}>
            {hasMore && (
              <button onClick={() => setShowAll((s) => !s)} style={presetBtnStyle}>
                {showAll ? "Show top 10" : `Show all (${rows.length})`}
              </button>
            )}
            <button onClick={handleExport} style={exportBtnStyle}>
              <Download size={14} />
              Export CSV
            </button>
          </div>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <Empty message="No facility data." />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, ...firstColStyle }}>Facility</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Orders</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Delivered</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Cancelled</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Cancel rate</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Avg fulfillment</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Units</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const canDrill = r.facility !== "Unassigned";
                return (
                  <tr key={r.facility}>
                    <td style={{ ...tdStyle, ...firstColTdStyle }}>
                      {canDrill ? (
                        <button
                          type="button"
                          onClick={() => onDrill(r.facility)}
                          style={{ background: "transparent", border: "none", padding: 0, color: PRIMARY, cursor: "pointer", fontWeight: 500, textAlign: "left" }}
                          title="Add to filters"
                        >
                          {r.facility}
                        </button>
                      ) : (
                        r.facility
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600 }}>{r.orders}</td>
                    <td style={{ ...tdStyle, textAlign: "center", color: COLOR_DELIVERED }}>{r.delivered || "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "center", color: r.cancelled > 0 ? COLOR_CANCELLED : "#cbd5e0" }}>
                      {r.cancelled || "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", color: r.cancelRate >= 0.1 ? COLOR_CANCELLED : BODY }}>
                      {r.orders ? formatPct(r.cancelRate) : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>{r.avgHours ? formatHours(r.avgHours) : "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>{r.units}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Card({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: PANEL_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: DARK }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return <div style={{ padding: 32, textAlign: "center", color: MUTED, fontSize: 13 }}>{message}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "inline-flex", flexDirection: "column", gap: 4, fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {label}
      {children}
    </label>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      style={{
        padding: "6px 10px",
        fontSize: 12,
        color: DARK,
        background: PANEL_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        cursor: "pointer",
        textTransform: "none",
        letterSpacing: 0,
        fontWeight: 500,
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${BORDER}`, borderRadius: 6, overflow: "hidden", background: PANEL_BG }}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              color: active ? "#ffffff" : BODY,
              background: active ? PRIMARY : PANEL_BG,
              border: "none",
              borderRight: i < options.length - 1 ? `1px solid ${BORDER}` : "none",
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: MUTED }}>
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "6px 8px",
          fontSize: 12,
          color: DARK,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          background: PANEL_BG,
        }}
      />
    </label>
  );
}

function ActiveFilterChips({
  filters,
  onRemove,
  insuranceLabel,
  companyLabel,
}: {
  filters: Filters;
  onRemove: (key: keyof Filters, value: string) => void;
  insuranceLabel: Map<string, string>;
  companyLabel: Map<string, string>;
}) {
  const items: Array<{ key: keyof Filters; value: string; label: string }> = [];
  filters.facilities.forEach((v) => items.push({ key: "facilities", value: v, label: `Facility: ${v}` }));
  filters.dispatchers.forEach((v) => items.push({ key: "dispatchers", value: v, label: `Dispatcher: ${v}` }));
  filters.companies.forEach((v) => items.push({ key: "companies", value: v, label: `Co: ${companyLabel.get(v) ?? v}` }));
  filters.insurance.forEach((v) => items.push({ key: "insurance", value: v, label: `Ins: ${insuranceLabel.get(v) ?? v}` }));
  filters.categories.forEach((v) => items.push({ key: "categories", value: v, label: `Cat: ${v}` }));
  filters.stages.forEach((v) => items.push({ key: "stages", value: v, label: `Stage: ${STAGE_LABELS[v as keyof typeof STAGE_LABELS] ?? v}` }));
  filters.statuses.forEach((v) => items.push({ key: "statuses", value: v, label: `Status: ${STATUS_LABELS[v as keyof typeof STATUS_LABELS] ?? v}` }));
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flexBasis: "100%", marginTop: 6 }}>
      {items.map((it) => (
        <button
          key={`${it.key}-${it.value}`}
          onClick={() => onRemove(it.key, it.value)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 6px 2px 8px",
            fontSize: 11,
            color: PRIMARY,
            background: PRIMARY_BG,
            border: `1px solid ${PRIMARY}33`,
            borderRadius: 12,
            cursor: "pointer",
          }}
          title="Remove filter"
        >
          {it.label}
          <X size={10} />
        </button>
      ))}
    </div>
  );
}

function MultiChip({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  const count = selected.size;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          fontSize: 12,
          fontWeight: 500,
          color: count > 0 ? PRIMARY : BODY,
          background: count > 0 ? PRIMARY_BG : PANEL_BG,
          border: `1px solid ${count > 0 ? PRIMARY : BORDER}`,
          borderRadius: 6,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {label}
        {count > 0 && (
          <span
            style={{
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 8,
              background: PRIMARY,
              color: "#ffffff",
              fontSize: 10,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {count}
          </span>
        )}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 30,
            minWidth: 220,
            maxHeight: 280,
            overflowY: "auto",
            background: PANEL_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            boxShadow: "rgba(50,50,93,0.15) 0px 13px 27px -5px, rgba(0,0,0,0.10) 0px 8px 16px -8px",
            padding: 4,
          }}
        >
          {count > 0 && (
            <button
              onClick={() => onChange(new Set())}
              style={{
                width: "100%",
                padding: "6px 10px",
                textAlign: "left",
                fontSize: 11,
                color: MUTED,
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${BORDER}`,
                cursor: "pointer",
              }}
            >
              Clear all
            </button>
          )}
          {options.length === 0 ? (
            <div style={{ padding: "12px 10px", fontSize: 12, color: MUTED }}>No options</div>
          ) : (
            options.map((opt) => {
              const isSel = selected.has(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => toggle(opt.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "6px 10px",
                    fontSize: 13,
                    textAlign: "left",
                    color: DARK,
                    background: isSel ? PRIMARY_BG : "transparent",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      border: `1px solid ${isSel ? PRIMARY : "#cbd5e0"}`,
                      background: isSel ? PRIMARY : PANEL_BG,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isSel && <Check size={10} color="#ffffff" />}
                  </span>
                  <span>{opt.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  padding: "6px 10px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 600,
  color: MUTED,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  background: "#f6f9fc",
  borderBottom: `1px solid ${BORDER}`,
  whiteSpace: "nowrap",
  lineHeight: 1.2,
};

const tdStyle: React.CSSProperties = {
  padding: "5px 8px",
  borderBottom: `1px solid ${BORDER}`,
  color: BODY,
  whiteSpace: "nowrap",
  lineHeight: 1.3,
};

const firstColStyle: React.CSSProperties = {
  position: "sticky",
  left: 0,
  background: "#f6f9fc",
  zIndex: 1,
  width: 1,
  paddingRight: 16,
};

const firstColTdStyle: React.CSSProperties = {
  fontWeight: 500,
  color: DARK,
  position: "sticky",
  left: 0,
  background: PANEL_BG,
  width: 1,
  paddingRight: 16,
};

const exportBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 500,
  color: PRIMARY,
  background: PRIMARY_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const presetBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 500,
  color: BODY,
  background: PANEL_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const resetBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 8px",
  fontSize: 11,
  color: MUTED,
  background: "transparent",
  border: "none",
  cursor: "pointer",
};
