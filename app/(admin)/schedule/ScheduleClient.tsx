"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, DoorClosed } from "lucide-react";
import { STAGE_LABELS } from "@/lib/order-types";
import { downloadCsv } from "@/lib/utils";
import { Muted } from "@/components/admin-ui";
import type { OrderStage } from "@prisma/client";

export type ScheduledItem = {
  id: string;
  orderId: string;
  orderNumber: string;
  patientName: string;
  facilityName: string | null;
  equipmentName: string;
  equipmentAbbr: string;
  quantity: number;
  driverId: number | null;
  driverName: string | null;
  completedAt: string | null;
  requestedDeliveryDate: string | null;
  stage: OrderStage;
  dischargeDate: string | null;
};

// Day-at-a-glance schedule view (Brent 2026-06). One row per OrderItem
// scheduled for the selected day — same patient can appear multiple times
// when an order's items split across days. Groups by driver so each driver
// sees their route in one block. Door Tag count surfaces the items whose
// parent order is currently in DOOR_TAG stage.
export default function ScheduleClient({ items, date }: { items: ScheduledItem[]; date: string }) {
  const router = useRouter();

  function setDate(next: string) {
    router.push(`/schedule?date=${next}`);
  }

  function shiftDay(delta: number) {
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    setDate(toIsoDay(d));
  }

  // Group by driver (single pass). "Unassigned" rolls all driver-less rows.
  const groups = useMemo(() => {
    const map = new Map<string, { driverName: string; rows: ScheduledItem[] }>();
    for (const it of items) {
      const key = it.driverName ?? "__unassigned__";
      const name = it.driverName ?? "Unassigned";
      if (!map.has(key)) map.set(key, { driverName: name, rows: [] });
      map.get(key)!.rows.push(it);
    }
    // Drivers alphabetical; Unassigned last so it doesn't compete with named
    // drivers at the top.
    return Array.from(map.values()).sort((a, b) => {
      if (a.driverName === "Unassigned") return 1;
      if (b.driverName === "Unassigned") return -1;
      return a.driverName.localeCompare(b.driverName);
    });
  }, [items]);

  const doorTagCount = items.filter((it) => it.stage === "DOOR_TAG").length;
  const totalItems = items.length;

  function exportCsv() {
    const header = [
      "Driver", "Order #", "Patient", "Facility", "Equipment", "Qty",
      "Stage", "Discharge", "Requested Delivery", "Completed",
    ];
    const data = items.map((it) => [
      it.driverName ?? "Unassigned",
      it.orderNumber,
      it.patientName,
      it.facilityName ?? "",
      it.equipmentName,
      String(it.quantity),
      STAGE_LABELS[it.stage],
      formatDayMaybe(it.dischargeDate),
      formatDayMaybe(it.requestedDeliveryDate),
      formatDayMaybe(it.completedAt),
    ]);
    downloadCsv(`schedule-${date}.csv`, [header, ...data]);
  }

  return (
    <div className="px-4 py-5 md:px-10 md:py-8" style={{ minHeight: "100%" }}>
      <div className="flex items-start justify-between gap-4" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="text-[26px] leading-tight" style={{ color: "#061b31", fontWeight: 300, letterSpacing: "-0.26px" }}>
            Schedule
          </h1>
          <p className="mt-1 text-[14px]" style={{ color: "#64748d", fontWeight: 300 }}>
            Every item scheduled for the selected day, grouped by driver. Items show up here when
            their completion date matches, or when the parent order's requested delivery is on this day.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={items.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] disabled:opacity-50"
          style={{ background: "#fff", border: "1px solid #e5edf5", color: "#273951", borderRadius: 4 }}
          title="Download the day's schedule (opens in Excel)"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Day picker + summary chips */}
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => shiftDay(-1)}
          aria-label="Previous day"
          style={{ display: "inline-flex", alignItems: "center", padding: "6px 8px", background: "#fff", border: "1px solid #e5edf5", borderRadius: 4, color: "#273951" }}
        >
          <ChevronLeft size={14} />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value || todayIso())}
          style={{
            padding: "6px 10px",
            fontSize: 13,
            border: "1px solid #e5edf5",
            borderRadius: 4,
            color: "#273951",
            fontFeatureSettings: '"tnum"',
          }}
        />
        <button
          type="button"
          onClick={() => shiftDay(1)}
          aria-label="Next day"
          style={{ display: "inline-flex", alignItems: "center", padding: "6px 8px", background: "#fff", border: "1px solid #e5edf5", borderRadius: 4, color: "#273951" }}
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          onClick={() => setDate(todayIso())}
          style={{ padding: "6px 10px", fontSize: 12, background: "transparent", border: "1px solid transparent", borderRadius: 4, color: "#4434d4" }}
        >
          Today
        </button>

        <span style={{ marginLeft: 12, fontSize: 12, color: "#64748d", fontFeatureSettings: '"tnum"' }}>
          {totalItems} item{totalItems === 1 ? "" : "s"} · {groups.length} driver group{groups.length === 1 ? "" : "s"}
        </span>
        {doorTagCount > 0 && (
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 8px",
              fontSize: 11, fontWeight: 500,
              background: "rgba(139,92,246,0.16)",
              color: "#6d3fbf",
              border: "1px solid rgba(139,92,246,0.25)",
              borderRadius: 3,
            }}
            title="Items whose parent order is currently in Door Tag stage"
          >
            <DoorClosed size={12} /> {doorTagCount} Door Tag
          </span>
        )}
      </div>

      {/* Body — per-driver tables */}
      {groups.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #e5edf5", borderRadius: 6, padding: 32, textAlign: "center", color: "#64748d", fontSize: 13 }}>
          Nothing scheduled for {formatDayMaybe(date)}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {groups.map((g) => (
            <div key={g.driverName} style={{ background: "#fff", border: "1px solid #e5edf5", borderRadius: 6, overflow: "hidden", boxShadow: "rgba(23,23,23,0.06) 0 3px 6px" }}>
              <div style={{ padding: "10px 14px", background: "#f6f9fc", borderBottom: "1px solid #e5edf5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#061b31" }}>{g.driverName}</span>
                <span style={{ fontSize: 11, color: "#64748d", fontFeatureSettings: '"tnum"' }}>{g.rows.length} item{g.rows.length === 1 ? "" : "s"}</span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e5edf5" }}>
                    <ThCell width="14%">Order #</ThCell>
                    <ThCell width="20%">Patient</ThCell>
                    <ThCell width="22%">Facility</ThCell>
                    <ThCell width="22%">Equipment</ThCell>
                    <ThCell width="10%">Stage</ThCell>
                    <ThCell width="12%">Completed</ThCell>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/tracker?order=${r.orderId}`)}
                      style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f9fc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <TdCell>
                        <span style={{ fontFamily: "SourceCodePro, ui-monospace, monospace", fontSize: 12, color: "#273951", fontFeatureSettings: '"tnum"' }}>
                          {r.orderNumber}
                        </span>
                      </TdCell>
                      <TdCell>
                        {r.patientName ? <span style={{ fontWeight: 500, color: "#061b31" }}>{r.patientName}</span> : <Muted>—</Muted>}
                      </TdCell>
                      <TdCell>{r.facilityName ?? <Muted>—</Muted>}</TdCell>
                      <TdCell>
                        <span>
                          {r.equipmentName}
                          {r.quantity > 1 && <span style={{ marginLeft: 6, color: "#64748d", fontFeatureSettings: '"tnum"' }}>×{r.quantity}</span>}
                        </span>
                      </TdCell>
                      <TdCell>
                        <span style={{ display: "inline-block", padding: "1px 6px", fontSize: 11, fontWeight: 500, background: "#f3f4f6", color: "#273951", borderRadius: 4 }}>
                          {STAGE_LABELS[r.stage]}
                        </span>
                      </TdCell>
                      <TdCell>
                        {r.completedAt ? (
                          <span style={{ color: "#108c3d", fontWeight: 500, fontFeatureSettings: '"tnum"' }}>
                            {formatDayMaybe(r.completedAt)}
                          </span>
                        ) : (
                          <Muted>—</Muted>
                        )}
                      </TdCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ThCell({ children, width }: { children: React.ReactNode; width: string }) {
  return (
    <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748d", width }}>
      {children}
    </th>
  );
}
function TdCell({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "10px 12px", verticalAlign: "middle" }}>{children}</td>;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function toIsoDay(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function formatDayMaybe(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
