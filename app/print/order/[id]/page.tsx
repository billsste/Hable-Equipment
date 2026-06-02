import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { SESSION_COOKIE, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ORDER_INCLUDE, toOrderShape } from "@/lib/order-helpers";
import { AUTH_LABELS, STAGE_LABELS } from "@/lib/order-types";
import PrintTrigger from "./PrintTrigger";

export const dynamic = "force-dynamic";

export default async function PrintOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) redirect("/login");
  const session = getSession(sessionId);
  if (!session) redirect("/login");

  const { id } = await params;
  const raw = await db.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
  if (!raw) notFound();

  const order = toOrderShape(raw);

  const groupedItems = order.items.reduce<Record<string, typeof order.items>>((acc, it) => {
    (acc[it.category] = acc[it.category] ?? []).push(it);
    return acc;
  }, {});

  const dcDate = order.dischargeDate
    ? new Date(order.dischargeDate).toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", year: "numeric",
      })
    : "Not set";

  const printedAt = new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });

  return (
    <>
      <PrintTrigger />
      <style>{`
        @page { size: Letter; margin: 0.5in; }
        @media print {
          .no-print { display: none !important; }
          body { background: #ffffff !important; }
        }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #f6f9fc; }
        .print-sheet { background: #ffffff; }
      `}</style>

      <div className="print-sheet" style={{ maxWidth: 720, margin: "16px auto", padding: 24, fontSize: 12, color: "#000", fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* Toolbar */}
        <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #e5edf5" }}>
          <button type="button" id="reprint-btn" style={{ padding: "6px 12px", background: "#533afd", color: "#fff", border: 0, borderRadius: 4, cursor: "pointer", fontSize: 13 }}>
            Print
          </button>
          <button type="button" id="close-btn" style={{ padding: "6px 12px", background: "#fff", color: "#273951", border: "1px solid #e5edf5", borderRadius: 4, cursor: "pointer", fontSize: 13 }}>
            Close
          </button>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748d", alignSelf: "center" }}>
            Generated {printedAt}
          </span>
        </div>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", color: "#64748d" }}>Delivery Ticket</div>
            <div style={{ fontSize: 24, fontWeight: 600, marginTop: 2 }}>{order.orderNumber}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#64748d" }}>EquipDispatch</div>
            <div style={{ fontSize: 11, color: "#64748d" }}>{STAGE_LABELS[order.stage]}</div>
          </div>
        </div>

        {/* Patient + Facility */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 20, paddingTop: 16, paddingBottom: 16, borderTop: "2px solid #000", borderBottom: "1px solid #e5edf5" }}>
          <div>
            <Label>Patient</Label>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{order.patientDisplay || "—"}</div>
          </div>
          <div>
            <Label>Facility</Label>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{order.facilityName || "—"}</div>
          </div>
        </div>

        {/* Key dates + people */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
          <Field label="Discharge Date" value={dcDate} highlight />
          {/* Brent 2026-06 commit B: per-item drivers replace order-level
              Dispatcher. Show a deduped driver list, or "Unassigned". */}
          <Field label="Driver(s)" value={
            (() => {
              const names = Array.from(new Set(order.items.map((it) => it.driverName).filter((n): n is string => !!n)));
              return names.length ? names.join(", ") : "Unassigned";
            })()
          } />
          <Field label="CSR" value={order.csrName ?? "—"} />
          <Field label="Primary Insurance" value={order.primaryInsuranceKey ?? "—"} />
          <Field label="Authorization" value={AUTH_LABELS[order.authStatus]} />
          <Field label="Handler" value={order.handler ?? "—"} />
          <Field
            label="Coinsurance"
            value={order.coinsurancePct != null ? `${order.coinsurancePct}%` : "—"}
          />
          <Field
            label="Deductible"
            value={
              order.deductibleAmount != null
                ? `$${order.deductibleAmount.toFixed(2)}`
                : "—"
            }
          />
        </div>

        {/* Equipment */}
        <div style={{ marginBottom: 20 }}>
          <Label>Equipment</Label>
          {order.items.length === 0 ? (
            <div style={{ padding: 12, color: "#94a3b8", fontStyle: "italic" }}>No equipment listed.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6, fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #000" }}>
                  <Th>Category</Th>
                  <Th>Item</Th>
                  <Th>Abbr</Th>
                  <Th right>Qty</Th>
                  <Th center>Delivered</Th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupedItems).flatMap(([cat, items]) =>
                  items.map((it, idx) => (
                    <tr key={it.id} style={{ borderBottom: "1px solid #e5edf5" }}>
                      <Td>{idx === 0 ? cat : ""}</Td>
                      <Td>{it.name}</Td>
                      <Td muted>{it.abbreviation}</Td>
                      <Td right>{it.quantity}</Td>
                      <Td center><span style={{ display: "inline-block", width: 14, height: 14, border: "1.5px solid #000" }} /></Td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Notes */}
        {order.notes && (
          <div style={{ marginBottom: 20 }}>
            <Label>Notes</Label>
            <div style={{ marginTop: 4, padding: 8, border: "1px solid #e5edf5", whiteSpace: "pre-wrap", fontSize: 12 }}>
              {order.notes}
            </div>
          </div>
        )}

        {/* Signature block */}
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid #000" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 32, marginBottom: 24 }}>
            <SignatureLine label="Recipient signature" />
            <SignatureLine label="Date / Time" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 32 }}>
            <SignatureLine label="Print recipient name" />
            <SignatureLine label="Relationship to patient" />
          </div>
        </div>

        <div style={{ marginTop: 32, fontSize: 10, color: "#64748d", textAlign: "center" }}>
          Order {order.orderNumber} · Generated {printedAt} · Confidential — handle per HIPAA policy
        </div>
      </div>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748d", fontWeight: 500 }}>{children}</div>;
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <div style={{ fontSize: 13, fontWeight: highlight ? 600 : 500, marginTop: 2, color: highlight ? "#b03238" : "#000" }}>{value}</div>
    </div>
  );
}

function Th({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return (
    <th style={{ padding: "6px 8px", textAlign: right ? "right" : center ? "center" : "left", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748d", fontWeight: 500 }}>
      {children}
    </th>
  );
}

function Td({ children, right, center, muted }: { children: React.ReactNode; right?: boolean; center?: boolean; muted?: boolean }) {
  return (
    <td style={{ padding: "6px 8px", textAlign: right ? "right" : center ? "center" : "left", color: muted ? "#64748d" : "#000", fontFamily: muted ? "ui-monospace, monospace" : undefined }}>
      {children}
    </td>
  );
}

function SignatureLine({ label }: { label: string }) {
  return (
    <div>
      <div style={{ height: 28, borderBottom: "1px solid #000" }} />
      <div style={{ marginTop: 4, fontSize: 10, color: "#64748d" }}>{label}</div>
    </div>
  );
}
