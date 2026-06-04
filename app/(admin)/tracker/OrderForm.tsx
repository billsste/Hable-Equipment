"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, AlertTriangle, Send, CheckCircle2, Plus, Printer, Truck } from "lucide-react";
import {
  AUTH_LABELS,
  AUTH_PICKER_VALUES,
  DELIVERY_STATUS_PICKER_VALUES,
  PENDING_DOCUMENT_OPTIONS,
  STAGE_COLORS,
  STAGE_LABELS,
  STATUS_LABELS,
  VERIFICATION_STATUS_LABELS,
  WORK_ORDER_TYPE_COLORS,
  WORK_ORDER_TYPE_LABELS,
  isBlockingStatus,
  isServiceCallType,
  requiresReason,
  type OrderShape,
  type VerificationStatus,
} from "@/lib/order-types";
import type { AuthStatus, OutcomeStatus, WorkOrderType } from "@prisma/client";
import { sortByLabel } from "@/components/admin-ui";
import type { Lookups } from "./TrackerClient";
import {
  ActionBtn,
  HistoryReadonly,
  Input,
  Label,
  NotesThread,
  Section,
  Stepper,
  displayName,
} from "./order-form-atoms";
import {
  ChipMulti,
  FacilitySelect,
  InsuranceSelect,
  SearchSelect,
  UserSelect,
} from "./order-form-selects";
import { EquipmentPicker } from "./order-form-equipment";
import OrderAttachments from "./OrderAttachments";

type Props =
  | {
      mode: "create";
      currentUser: { id: number; name: string; roles: string[] };
      lookups: Lookups;
      onClose: () => void;
      onSaved: (order: OrderShape) => void;
    }
  | {
      mode: "edit";
      order: OrderShape;
      currentUser: { id: number; name: string; roles: string[] };
      lookups: Lookups;
      onClose: () => void;
      onSaved: (order: OrderShape) => void;
    };

export default function OrderForm(props: Props) {
  const { mode, currentUser, lookups, onClose, onSaved } = props;
  const initial = mode === "edit" ? props.order : null;

  const [workOrderType, setWorkOrderType] = useState<WorkOrderType>(initial?.workOrderType ?? "DELIVERY");
  const [csrId, setCsrId] = useState<number | null>(initial?.csrId ?? currentUser.id);
  const [patientFirst, setPatientFirst] = useState(initial?.patientFirst ?? "");
  const [patientLast, setPatientLast] = useState(initial?.patientLast ?? "");
  const [facilityId, setFacilityId] = useState<number | null>(initial?.facilityId ?? null);
  const [callReceivedDate, setCallReceivedDate] = useState(initial?.callReceivedDate?.slice(0, 10) ?? "");

  const [primary, setPrimary] = useState<string | null>(initial?.primaryInsuranceKey ?? null);
  const [secondary, setSecondary] = useState<string | null>(initial?.secondaryInsuranceKey ?? null);
  const [deductible, setDeductible] = useState<"MET" | "NOT_MET" | "NA" | null>(initial?.deductibleStatus ?? null);
  const [coinsurancePct, setCoinsurancePct] = useState(
    initial?.coinsurancePct != null ? String(initial.coinsurancePct) : "",
  );
  const [deductibleAmount, setDeductibleAmount] = useState(
    initial?.deductibleAmount != null ? String(initial.deductibleAmount) : "",
  );
  const [authStatus, setAuthStatus] = useState<OrderShape["authStatus"]>(initial?.authStatus ?? "NOT_REQ");
  const [dosSubmitted, setDosSubmitted] = useState(initial?.dosSubmitted?.slice(0, 10) ?? "");
  // Brent 2026-06: Plan ID / Plan Name / Plan Type / Data Entry / Billing
  // fields are removed from the form. Existing rows still carry data in the
  // DB but the form no longer reads or writes them. A follow-up commit drops
  // the columns once nothing references them.
  // PENDING_DOCUMENTS multi-select — visible only when authStatus === "PENDING_DOCUMENTS".
  const [pendingDocuments, setPendingDocuments] = useState<string[]>(initial?.pendingDocuments ?? []);
  // Verification-step manual outcome (Ready for Delivery / On Hold / Transferred).
  const [verificationStatus, setVerificationStatus] = useState<OrderShape["verificationStatus"]>(initial?.verificationStatus ?? null);

  const [companies, setCompanies] = useState<string[]>(initial?.fulfillmentCompanies ?? []);
  const [dischargeDate, setDischargeDate] = useState(initial?.dischargeDate?.slice(0, 10) ?? "");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState(
    initial?.requestedDeliveryDate?.slice(0, 10) ?? "",
  );
  // Eldercare toggle replaces the legacy ELDERCARE work-order type.
  const [eldercare, setEldercare] = useState<boolean>(initial?.eldercare ?? false);
  // Items now carry per-row driver + completedAt (replaces the order-level
  // dispatcherId + deliveredAt fields). Drivers are independent per line so
  // one order can split across multiple drivers and dates.
  const [items, setItems] = useState<Array<{ equipmentId: string; quantity: number; driverId: number | null; scheduledDeliveryDate: string; completedAt: string; deliveryStatus: OutcomeStatus; doorTagCount: number }>>(
    initial?.items.map((it) => ({
      equipmentId: it.equipmentId,
      quantity: it.quantity,
      driverId: it.driverId ?? null,
      scheduledDeliveryDate: it.scheduledDeliveryDate?.slice(0, 10) ?? "",
      completedAt: it.completedAt?.slice(0, 10) ?? "",
      deliveryStatus: it.deliveryStatus ?? "ACTIVE",
      doorTagCount: it.doorTagCount ?? 0,
    })) ?? [],
  );
  const [noteDraft, setNoteDraft] = useState("");

  const [status, setStatus] = useState<OutcomeStatus>(initial?.status ?? "ACTIVE");
  const [statusReason, setStatusReason] = useState(initial?.cancellationReason ?? "");

  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState("");

  const [step, setStep] = useState(1);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dirty-state guard. Snapshot every editable field on first render so we
  // can tell whether the user has touched anything since open. Tab switches
  // (Initial Intake / Verification / Fulfillment) don't reset state — they
  // toggle visibility inside the same component — so this still works
  // across all three views. After a successful save the modal unmounts via
  // onSaved, so we don't need to re-baseline mid-life.
  const currentSnapshot = JSON.stringify({
    workOrderType, csrId, patientFirst, patientLast, facilityId,
    callReceivedDate, primary, secondary, deductible, coinsurancePct,
    deductibleAmount, authStatus, dosSubmitted, pendingDocuments,
    verificationStatus, companies, dischargeDate, requestedDeliveryDate,
    eldercare, items, noteDraft, status, statusReason,
  });
  const initialSnapshotRef = useRef<string | null>(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = currentSnapshot;
  }
  const isDirty =
    !justSaved && !saving && initialSnapshotRef.current !== currentSnapshot;

  // Wraps every modal-close vector (X button, Escape, backdrop click). When
  // there are unsaved edits, ask before discarding so the dispatcher can't
  // lose a half-filled Verification tab by accidentally clicking outside.
  function safeClose() {
    if (isDirty) {
      const ok = window.confirm(
        "You have unsaved changes. Discard them?",
      );
      if (!ok) return;
    }
    onClose();
  }

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      safeClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // safeClose closes over `isDirty`; rebind so the latest value is used.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, onClose]);

  // Browser-level guard for refresh / tab close / nav-away. Standard
  // beforeunload pattern — browsers ignore custom messages, but the
  // `returnValue = ""` is what triggers the native "Leave site?" dialog.
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  function toggleCompany(key: string) {
    setCompanies((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleCreate() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/tracker/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderType,
          eldercare,
          csrId,
          patientFirst,
          patientLast,
          facilityId,
          callReceivedDate: callReceivedDate || null,
          dischargeDate: dischargeDate || null,
          requestedDeliveryDate: requestedDeliveryDate || null,
          // Verification (Stage 2) — optional at create; fillable all at once.
          primaryInsuranceKey: primary,
          secondaryInsuranceKey: secondary,
          deductibleStatus: deductible,
          coinsurancePct: coinsurancePct.trim() === "" ? null : Number(coinsurancePct),
          deductibleAmount: deductibleAmount.trim() === "" ? null : Number(deductibleAmount),
          authStatus,
          pendingDocuments: authStatus === "PENDING_DOCUMENTS" ? pendingDocuments : [],
          verificationStatus,
          dosSubmitted: dosSubmitted || null,
          // Fulfillment & dispatch (Stage 3) — optional at create.
          fulfillmentCompanies: companies,
          status,
          cancellationReason: statusReason || null,
          // Per-item driver + scheduled / completed dates + per-item
          // delivery status replace the old order-level fields.
          items: items.map((it) => ({
            equipmentId: it.equipmentId,
            quantity: it.quantity,
            driverId: it.driverId,
            scheduledDeliveryDate: it.scheduledDeliveryDate || null,
            completedAt: it.completedAt || null,
            deliveryStatus: it.deliveryStatus,
            doorTagCount: it.doorTagCount,
          })),
          noteToAdd: noteDraft.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface the HTTP status when the server response is missing an
        // `error` field (e.g. an unexpected 5xx or a stale client bundle
        // talking to a newer endpoint). Generic "Could not create order"
        // alone leaves the user with nothing actionable.
        setError(data.error ?? `Could not create order (HTTP ${res.status}). Try reloading the page.`);
        return;
      }
      setJustSaved(true);
      savedTimerRef.current = setTimeout(() => onSaved(data.order as OrderShape), 700);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(extra: Record<string, unknown> = {}) {
    if (mode !== "edit") return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/tracker/orders/${props.order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderType,
          eldercare,
          csrId,
          patientFirst,
          patientLast,
          facilityId,
          callReceivedDate: callReceivedDate || null,
          primaryInsuranceKey: primary,
          secondaryInsuranceKey: secondary,
          deductibleStatus: deductible,
          coinsurancePct: coinsurancePct.trim() === "" ? null : Number(coinsurancePct),
          deductibleAmount: deductibleAmount.trim() === "" ? null : Number(deductibleAmount),
          authStatus,
          pendingDocuments: authStatus === "PENDING_DOCUMENTS" ? pendingDocuments : [],
          verificationStatus,
          dosSubmitted: dosSubmitted || null,
          fulfillmentCompanies: companies,
          dischargeDate: dischargeDate || null,
          requestedDeliveryDate: requestedDeliveryDate || null,
          // Per-item driver + scheduled + completed dates + per-item
          // delivery status. No more order-level dispatcherId / deliveredAt.
          items: items.map((it) => ({
            equipmentId: it.equipmentId,
            quantity: it.quantity,
            driverId: it.driverId,
            scheduledDeliveryDate: it.scheduledDeliveryDate || null,
            completedAt: it.completedAt || null,
            deliveryStatus: it.deliveryStatus,
            doorTagCount: it.doorTagCount,
          })),
          noteToAdd: noteDraft.trim() || null,
          status,
          cancellationReason: statusReason,
          ...extra,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Could not save order (HTTP ${res.status}). Try reloading the page.`);
        return;
      }
      setJustSaved(true);
      savedTimerRef.current = setTimeout(() => onSaved(data.order as OrderShape), 700);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreatePickup() {
    if (!initial) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/tracker/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderType: "PICK_UP",
          linkedOrderId: initial.id,
          csrId: currentUser.id,
          patientFirst: initial.patientFirst,
          patientLast: initial.patientLast,
          facilityId: initial.facilityId,
          items: initial.items.map((it) => ({ equipmentId: it.equipmentId, quantity: it.quantity })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Could not create pickup (HTTP ${res.status}). Try reloading the page.`);
        return;
      }
      setJustSaved(true);
      savedTimerRef.current = setTimeout(() => onSaved(data.order as OrderShape), 700);
    } finally {
      setSaving(false);
    }
  }

  // "Signature still needed" warning was removed alongside the
  // What's-Still-Needed field — the new Pending Document Actions multi-select
  // captures missing signatures directly when auth is PENDING_DOCUMENTS.
  const signatureWarning: string | null = null;

  const stageInfo = initial ? STAGE_COLORS[initial.stage] : { bg: "rgba(83,58,253,0.10)", color: "#4434d4" };
  const isCreate = mode === "create";
  const stageLabel = isCreate ? "New Order — Initial Intake" : STAGE_LABELS[(initial as OrderShape).stage];
  const showTypeChip = !isCreate && workOrderType !== "DELIVERY";
  const typeChipColor = WORK_ORDER_TYPE_COLORS[workOrderType];

  const actionButtons = !isCreate ? renderStageActions() : null;

  function renderStageActions() {
    if (!initial) return null;
    const o = initial;
    const buttons: React.ReactNode[] = [];
    if (o.stage !== "CANCELLED") {
      buttons.push(
        <ActionBtn
          key="print-ticket"
          icon={<Printer size={14} />}
          label="Print Ticket"
          tone="ghost"
          onClick={() => window.open(`/print/order/${o.id}`, "_blank", "noopener,noreferrer")}
        />,
      );
    }
    if (o.stage === "READY_TO_ASSIGN" && items.some((it) => it.driverId != null) && !o.printedAt) {
      buttons.push(
        <ActionBtn
          key="print"
          icon={<Printer size={14} />}
          label="Mark Printed"
          tone="primary"
          onClick={() => handleSave({ action: "print" })}
        />,
      );
    }
    if (o.stage === "ASSIGNED" && !o.acknowledgedAt) {
      buttons.push(
        <ActionBtn
          key="ack"
          icon={<CheckCircle2 size={14} />}
          label="Acknowledge"
          tone="primary"
          onClick={() => handleSave({ action: "acknowledge" })}
        />,
      );
    }
    if (o.stage === "ACKNOWLEDGED" && !o.outForDeliveryAt) {
      buttons.push(
        <ActionBtn
          key="out"
          icon={<Truck size={14} />}
          label="Out for Delivery"
          tone="primary"
          onClick={() => handleSave({ action: "out_for_delivery" })}
        />,
      );
    }
    // Brent 2026-06: Door Tag is no longer an order-level action button —
    // it's tracked per item via the ± stepper in the Stage 3 driver table.
    // Drivers update the count from the road; the order's overall status
    // is whatever Delivery Status the CSR / driver picks separately.
    if (o.stage === "DELIVERED" && o.workOrderType === "DELIVERY") {
      buttons.push(
        <ActionBtn
          key="create-pickup"
          icon={<Plus size={14} />}
          label="Create Pickup"
          tone="ghost"
          onClick={handleCreatePickup}
        />,
      );
    }
    return buttons;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4"
      style={{ background: "rgba(6,27,49,0.4)" }}
    >
      <div className="absolute inset-0" onClick={safeClose} />
      <div
        className="relative z-10 h-[100dvh] md:h-auto md:max-h-[92vh] w-full max-w-[1100px] overflow-hidden flex flex-col rounded-none md:rounded-lg"
        style={{
          background: "#ffffff",
          boxShadow:
            "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.10) 0px 18px 36px -18px",
        }}
      >
        <div
          className="px-4 py-3 md:px-5 md:py-3 flex items-start justify-between gap-3 flex-shrink-0"
          style={{ borderBottom: "1px solid #e5edf5", background: "#ffffff" }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="flex items-center gap-2" style={{ height: 18 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 18,
                  padding: "0 6px",
                  background: stageInfo.bg,
                  color: stageInfo.color,
                  borderRadius: 3,
                  border: `1px solid ${stageInfo.color}33`,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {stageLabel}
              </span>
              {!isCreate && (
                <span
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 11,
                    color: "#94a3b8",
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {(initial as OrderShape).orderNumber}
                </span>
              )}
              {showTypeChip && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 18,
                    padding: "0 6px",
                    background: typeChipColor.bg,
                    color: typeChipColor.color,
                    borderRadius: 3,
                    border: `1px solid ${typeChipColor.color}33`,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {WORK_ORDER_TYPE_LABELS[workOrderType]}
                </span>
              )}
            </div>
            <h2
              style={{
                marginTop: 6,
                color: "#061b31",
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: "-0.2px",
                lineHeight: 1.2,
              }}
            >
              {isCreate ? "Create New Order" : displayName(patientFirst, patientLast) || "Untitled Order"}
            </h2>
          </div>
          <button
            onClick={safeClose}
            className="transition-colors"
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#64748d",
              borderRadius: 4,
              marginTop: -2,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f9fc")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X size={18} />
          </button>
        </div>

        <Stepper step={step} onChange={setStep} />

        <div
          className="flex-1 overflow-y-auto px-4 py-3 md:px-5 md:py-3 space-y-3"
          style={{ background: "#f6f9fc" }}
        >
          {error && (
            <div
              className="flex items-start gap-2 px-3 py-2 text-[13px]"
              style={{
                background: "rgba(229,72,77,0.08)",
                color: "#b03238",
                border: "1px solid rgba(229,72,77,0.30)",
                borderRadius: 4,
              }}
            >
              <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {step === 1 && (
            <Section
              title="Stage 1 — Initial Intake"
              subtitle="The details captured the moment a referral call comes in."
            >
              {!isCreate && initial?.linkedOrderNumber && (
                <div className="mb-2 text-[11px]" style={{ color: "#64748d" }}>
                  Linked to order {initial.linkedOrderNumber}
                </div>
              )}
              {/* Three-column grid throughout Stage 1 so no single field
                  stretches the full row. Work Order Type / Eldercare / CSR
                  read as the "who/what" header; patient + facility on row 2;
                  the three scheduling dates share row 3; Equipment is the
                  only full-width control (picker has its own width). */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                <SearchSelect
                  label="Work Order Type"
                  value={workOrderType}
                  onChange={(v) => setWorkOrderType((v as WorkOrderType) ?? "DELIVERY")}
                  // Brent 2026-06: ELDERCARE + SERVICE_PICKUP no longer
                  // selectable. ELDERCARE is replaced by the boolean
                  // eldercare flag below; SERVICE_PICKUP folds into PICK_UP.
                  options={sortByLabel((Object.keys(WORK_ORDER_TYPE_LABELS) as WorkOrderType[]).map((k) => ({
                    value: k,
                    label: WORK_ORDER_TYPE_LABELS[k],
                  })))}
                />
                <SearchSelect
                  label="Eldercare"
                  value={eldercare ? "YES" : "NO"}
                  onChange={(v) => setEldercare(v === "YES")}
                  placeholder="Search…"
                  options={[
                    { value: "NO",  label: "No" },
                    { value: "YES", label: "Yes" },
                  ]}
                />
                <UserSelect
                  label="CSR"
                  value={csrId}
                  onChange={setCsrId}
                  options={lookups.csrs}
                  required
                />
                <Input
                  label="Patient First Name"
                  value={patientFirst}
                  onChange={setPatientFirst}
                  required={!isServiceCallType(workOrderType)}
                />
                <Input
                  label="Patient Last Name"
                  value={patientLast}
                  onChange={setPatientLast}
                  required={!isServiceCallType(workOrderType)}
                />
                <FacilitySelect
                  label="Facility"
                  value={facilityId}
                  onChange={setFacilityId}
                  options={lookups.facilities}
                  required
                />
                <Input
                  label="Order Date"
                  type="date"
                  value={callReceivedDate}
                  onChange={setCallReceivedDate}
                />
                <Input
                  label="Scheduled Discharge Date"
                  type="date"
                  value={dischargeDate}
                  onChange={setDischargeDate}
                />
                <Input
                  label="Requested Delivery Date"
                  type="date"
                  value={requestedDeliveryDate}
                  onChange={setRequestedDeliveryDate}
                />
                <div style={{ gridColumn: "1 / -1" }}>
                  <Label>Equipment</Label>
                  <EquipmentPicker
                    equipment={lookups.equipment}
                    value={items}
                    onChange={setItems}
                    defaults={{ driverId: null, scheduledDeliveryDate: "", completedAt: "", deliveryStatus: "ACTIVE" as OutcomeStatus, doorTagCount: 0 }}
                  />
                </div>
              </div>
            </Section>
          )}

          {step === 2 && (
            <Section
              title="Stage 2 — Verification"
              subtitle="Insurance, deductible, authorization, and fulfillment routing."
            >
              {/* 3-col grid across the whole stage so every field lands on
                  the same baseline. Insurance pair + Deductible Met? share
                  row 1 — the three together read as "how are we paying?". */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                <InsuranceSelect
                  label="Primary Insurance"
                  value={primary}
                  onChange={setPrimary}
                  options={lookups.insurance}
                />
                <InsuranceSelect
                  label="Secondary Insurance"
                  value={secondary}
                  onChange={setSecondary}
                  options={lookups.insurance}
                  optional
                />
                <SearchSelect
                  label="Deductible Met?"
                  value={deductible}
                  onChange={(v) => setDeductible(v as "MET" | "NOT_MET" | "NA" | null)}
                  placeholder="Search…"
                  options={[
                    { value: "MET", label: "Met" },
                    { value: "NOT_MET", label: "Not Met" },
                    { value: "NA", label: "N/A" },
                  ]}
                />
              </div>

              {/* Row 2 finishes the "how are we paying?" block: the two
                  amount fields and the DOS Submitted date stamp. DOS is
                  always shown now (no longer auth-conditional) so the row
                  reads top-to-bottom without surprises. */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
                <Input
                  label="Coinsurance %"
                  value={coinsurancePct}
                  onChange={(v) => setCoinsurancePct(v.replace(/[^\d]/g, "").slice(0, 3))}
                  inputMode="numeric"
                  placeholder="20"
                  suffix="%"
                />
                <Input
                  label="Deductible Amount"
                  value={deductibleAmount}
                  onChange={(v) => setDeductibleAmount(v.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  placeholder="0.00"
                  prefix="$"
                />
                <Input
                  label="DOS Submitted"
                  type="date"
                  value={dosSubmitted}
                  onChange={setDosSubmitted}
                />
              </div>

              {/* Verification outcome row: Order Status anchors the left,
                  Authorization Status sits in the middle, Pending Document
                  Actions reserves the right column. The third slot stays
                  empty (but its width is held) until Auth = Pending
                  Documents — keeps the row's column boundaries stable so
                  picking Pending Docs doesn't shift the page layout. */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 12,
                  marginTop: 12,
                  alignItems: "start",
                }}
              >
                <SearchSelect
                  label="Order Status"
                  value={verificationStatus}
                  onChange={(v) => setVerificationStatus((v as VerificationStatus | null) ?? null)}
                  placeholder="Search…"
                  options={sortByLabel((Object.keys(VERIFICATION_STATUS_LABELS) as VerificationStatus[]).map((k) => ({
                    value: k,
                    label: VERIFICATION_STATUS_LABELS[k],
                  })))}
                />
                <div>
                  <SearchSelect
                    label="Authorization Status"
                    required={workOrderType === "DELIVERY"}
                    value={authStatus}
                    onChange={(v) => setAuthStatus((v ?? "NOT_REQ") as AuthStatus)}
                    placeholder="Search…"
                    options={sortByLabel(
                      Array.from(
                        new Set<AuthStatus>([...AUTH_PICKER_VALUES, authStatus]),
                      ).map((k) => ({ value: k, label: AUTH_LABELS[k] })),
                    )}
                  />
                  {signatureWarning && (
                    <div
                      className="mt-1 text-[11px] flex items-start gap-1"
                      style={{ color: "#9b6829" }}
                    >
                      <AlertTriangle size={11} style={{ marginTop: 2, flexShrink: 0 }} />
                      <span>{signatureWarning}</span>
                    </div>
                  )}
                </div>
                {authStatus === "PENDING_DOCUMENTS" ? (
                  <div>
                    <Label>Pending Document Actions</Label>
                    <ChipMulti
                      value={pendingDocuments}
                      onToggle={(key) =>
                        setPendingDocuments((prev) =>
                          prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
                        )
                      }
                      options={PENDING_DOCUMENT_OPTIONS.map((d) => ({ key: d.key, label: d.label }))}
                    />
                  </div>
                ) : (
                  <div />
                )}
              </div>

              {/* Fulfillment Companies pinned to ~1/3 of the row width so
                  the chip block matches the dropdowns above. Only 3 options
                  exist (Action Medical / Care One / Christian Mobility), so
                  a wider box wastes space. */}
              <div style={{ marginTop: 12, maxWidth: 400 }}>
                <Label>Fulfillment Companies</Label>
                <ChipMulti
                  options={lookups.companies.map((c) => ({ key: c.key, label: c.label }))}
                  value={companies}
                  onToggle={toggleCompany}
                  placeholder="Search companies to add…"
                />
              </div>
            </Section>
          )}

          {step === 3 && (
            <Section
              title="Stage 3 — Fulfillment & Dispatch"
              subtitle="Review the order, assign a dispatcher, set the schedule, then flag the outcome."
            >
              {!isCreate && (
                <>
                  <SubHeader label="1 · Review Order" first />
                  <DispatcherReadonly order={initial as OrderShape} />
                </>
              )}

              <SubHeader label="2 · Driver assignments" first={isCreate} />
              {/* Brent 2026-06: one driver + one completion date per line item.
                  Replaces the order-level Dispatcher + Delivery Date so one
                  order can split across multiple drivers/days. Items come
                  from Stage 1's equipment picker — add equipment there first
                  if the list is empty. */}
              {isBlockingStatus(status) ? (
                <DispatcherLocked statusLabel={STATUS_LABELS[status]} />
              ) : items.length === 0 ? (
                <div style={{ padding: "12px 14px", fontSize: 12, color: "#64748d", background: "#f6f9fc", border: "1px solid #e5edf5", borderRadius: 4 }}>
                  Add equipment in Stage 1 first — driver and completion date attach to each line item.
                </div>
              ) : (
                <PerItemDrivers
                  items={items}
                  equipmentLookup={lookups.equipment}
                  driverLookup={lookups.dispatchers}
                  onChange={setItems}
                />
              )}

              {/* Handler field removed (Brent 2026-06 follow-up) — the
                  internal/rep/facility distinction wasn't being used in
                  practice. DB column stays for legacy reads; UI no longer
                  reads or writes it. */}

              <SubHeader label="3 · Schedule" />
              {/* Stage 1 dates mirrored read-only, three across so each takes
                  one column instead of wrapping to two rows. */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                <ReadonlyDate
                  label="Order Date"
                  iso={isCreate ? (callReceivedDate || null) : (initial as OrderShape).callReceivedDate}
                />
                <ReadonlyDate
                  label="Scheduled Discharge Date"
                  iso={isCreate ? (dischargeDate || null) : (initial as OrderShape).dischargeDate}
                />
                <ReadonlyDate
                  label="Requested Delivery Date"
                  iso={isCreate ? (requestedDeliveryDate || null) : (initial as OrderShape).requestedDeliveryDate}
                />
              </div>

              <SubHeader label="4 · Outcome" />
              {/* Delivery Status + Reason share one 3-col row. Reason slot is
                  empty unless the status requires it (cancel/hold/etc.). */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                <SearchSelect
                  label="Overall Delivery Status"
                  value={status}
                  onChange={(v) => {
                    const next = (v ?? "ACTIVE") as OutcomeStatus;
                    setStatus(next);
                    if (!requiresReason(next)) setStatusReason("");
                  }}
                  options={sortByLabel(
                    Array.from(
                      new Set<OutcomeStatus>([...DELIVERY_STATUS_PICKER_VALUES, status]),
                    ).map((k) => ({ value: k, label: STATUS_LABELS[k] })),
                  )}
                />
                {requiresReason(status) && (
                  <SearchSelect
                    label="Reason"
                    required
                    value={statusReason || null}
                    onChange={(v) => setStatusReason(v ?? "")}
                    options={sortByLabel(lookups.cancellationReasons.map((r) => ({
                      value: r.label,
                      label: r.label,
                    })))}
                  />
                )}
              </div>
            </Section>
          )}

          <Section title="Notes" subtitle="">
            <NotesThread
              order={initial as OrderShape | null}
              draft={noteDraft}
              onDraftChange={setNoteDraft}
            />
          </Section>

          {!isCreate && (initial as OrderShape) && (
            <Section title="Attachments" subtitle="Intake forms, signed delivery tickets, insurance docs. Stored encrypted with the order.">
              <OrderAttachments orderId={(initial as OrderShape).id} />
            </Section>
          )}

          {!isCreate && (initial as OrderShape) && (
            <Section title="History" subtitle="">
              <HistoryReadonly order={initial as OrderShape} />
            </Section>
          )}
        </div>

        <div
          className="px-4 py-2.5 md:px-5 flex flex-col-reverse md:flex-row md:flex-wrap items-stretch md:items-center justify-between gap-2 flex-shrink-0"
          style={{ borderTop: "1px solid #e5edf5", background: "#ffffff" }}
        >
          <div className="flex flex-wrap gap-1.5">{actionButtons}</div>
          <div className="flex items-center gap-2 w-full md:w-auto md:flex-wrap md:justify-end">
            {isDirty && (
              // Quiet inline indicator so the dispatcher can tell at a
              // glance whether they have edits in flight. Pulses on the dot
              // to draw the eye without alarming. Stays visible until the
              // user hits Save (which clears justSaved) or discards.
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  fontWeight: 500,
                  color: "#9b6829",
                  background: "rgba(245,158,11,0.10)",
                  border: "1px solid rgba(245,158,11,0.30)",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                }}
                title="You have unsaved edits. Closing or refreshing will discard them."
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#9b6829",
                    display: "inline-block",
                  }}
                />
                Unsaved changes
              </span>
            )}
          <button
            onClick={isCreate ? handleCreate : () => handleSave()}
            disabled={saving || justSaved}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 md:py-1.5 text-[13px] md:text-[12px] disabled:opacity-90 w-full md:w-auto"
            style={{
              background: justSaved ? "#15be53" : "#533afd",
              color: "#ffffff",
              borderRadius: 4,
              fontWeight: 500,
              transition: "background 120ms ease",
            }}
            onMouseEnter={(e) => {
              if (!saving && !justSaved) (e.currentTarget as HTMLButtonElement).style.background = "#4434d4";
            }}
            onMouseLeave={(e) => {
              if (!saving && !justSaved) (e.currentTarget as HTMLButtonElement).style.background = "#533afd";
            }}
          >
            {justSaved ? (
              <CheckCircle2 size={13} />
            ) : saving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}
            {justSaved ? "Saved" : isCreate ? "Create Order" : "Save Changes"}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DispatcherReadonly({ order }: { order: OrderShape }) {
  const cityState = [order.facilityCity, order.facilityState].filter(Boolean).join(", ");
  const hasStreet = Boolean(order.facilityAddress);
  const addressLines = hasStreet
    ? [order.facilityAddress, [cityState, order.facilityZip].filter(Boolean).join(" ").trim()].filter(Boolean)
    : [];
  const mapsHref = hasStreet
    ? `https://maps.google.com/?q=${encodeURIComponent(
        [order.facilityName, order.facilityAddress, cityState, order.facilityZip].filter(Boolean).join(" "),
      )}`
    : null;
  const telHref = order.facilityPhone ? `tel:${order.facilityPhone.replace(/[^0-9+]/g, "")}` : null;

  const itemsByCategory = order.items.reduce<Record<string, typeof order.items>>((acc, it) => {
    (acc[it.category] ??= []).push(it);
    return acc;
  }, {});
  const categories = Object.keys(itemsByCategory).sort();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, alignItems: "start" }}>
      <ReadonlyRow label="Facility">
        <div style={{ fontSize: 14, fontWeight: 600, color: "#061b31", lineHeight: 1.25 }}>
          {order.facilityName ?? "—"}
        </div>
        {mapsHref ? (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              marginTop: 2,
              fontSize: 12,
              color: "#4434d4",
              textDecoration: "underline",
              lineHeight: 1.35,
            }}
          >
            {addressLines.map((line, i) => (
              <span key={i} style={{ display: "block" }}>{line}</span>
            ))}
          </a>
        ) : (
          <div style={{ marginTop: 2, fontSize: 12, color: "#94a3b8" }}>
            No address on file
          </div>
        )}
        {(telHref || order.facilityContact) && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5" style={{ marginTop: 4, fontSize: 12 }}>
            {telHref ? (
              <a href={telHref} style={{ color: "#4434d4", textDecoration: "underline" }}>
                {order.facilityPhone}
              </a>
            ) : null}
            {order.facilityContact ? (
              <span style={{ color: "#273951" }}>Contact: {order.facilityContact}</span>
            ) : null}
          </div>
        )}
      </ReadonlyRow>

      <ReadonlyRow label={`Equipment (${order.items.length})`}>
        {order.items.length === 0 ? (
          <div style={{ fontSize: 12, color: "#94a3b8" }}>No items.</div>
        ) : (
          <div className="space-y-1.5">
            {categories.map((cat) => (
              <div key={cat}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: 3,
                  }}
                >
                  {cat}
                </div>
                <div className="space-y-1">
                  {itemsByCategory[cat].map((it) => {
                    const meta = [it.abbreviation, it.hcpcsCode].filter(Boolean).join(" · ");
                    return (
                      <div
                        key={it.id}
                        className="flex items-center gap-2"
                        style={{
                          padding: "5px 8px",
                          background: "#f6f9fc",
                          borderRadius: 4,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "#061b31", lineHeight: 1.2 }}>
                            {it.name}
                          </div>
                          {meta && (
                            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>
                              {meta}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            flexShrink: 0,
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#4434d4",
                            fontFeatureSettings: '"tnum"',
                          }}
                        >
                          ×{it.quantity}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </ReadonlyRow>
    </div>
  );
}

function SubHeader({ label, first = false }: { label: string; first?: boolean }) {
  return (
    <div
      className="flex items-center gap-2"
      style={{ marginTop: first ? 4 : 22, marginBottom: 8 }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, height: 1, background: "#e5edf5" }} />
    </div>
  );
}

function ReadonlyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function DispatcherLocked({ statusLabel }: { statusLabel: string }) {
  return (
    <div>
      <Label>Dispatcher</Label>
      <div
        className="px-3 py-2 text-[13px]"
        style={{
          background: "#f6f9fc",
          border: "1px solid #e5edf5",
          borderRadius: 4,
          color: "#64748d",
          minHeight: 36,
          display: "flex",
          alignItems: "center",
        }}
      >
        Locked — order is {statusLabel}.
      </div>
    </div>
  );
}

// Per-item driver + completion table for Stage 3. One row per OrderItem.
// Each row shows the equipment name + qty (read-only) and exposes a driver
// dropdown + completed-date input. Driver list is shared with the rest of
// the form via Lookups (legacy "dispatchers" key — Phase 3 renames it).
// Per-item driver + completion + door-tag table for Stage 3. Door tags are
// tracked per line (a delivery attempt that leaves a tag for one piece of
// equipment doesn't necessarily apply to the other items on the same order,
// especially when items are split across different drivers).
function PerItemDrivers({
  items,
  equipmentLookup,
  driverLookup,
  onChange,
}: {
  items: Array<{ equipmentId: string; quantity: number; driverId: number | null; scheduledDeliveryDate: string; completedAt: string; deliveryStatus: OutcomeStatus; doorTagCount: number }>;
  equipmentLookup: Lookups["equipment"];
  driverLookup: Lookups["dispatchers"];
  onChange: (items: Array<{ equipmentId: string; quantity: number; driverId: number | null; scheduledDeliveryDate: string; completedAt: string; deliveryStatus: OutcomeStatus; doorTagCount: number }>) => void;
}) {
  function patch(idx: number, p: Partial<{ driverId: number | null; scheduledDeliveryDate: string; completedAt: string; deliveryStatus: OutcomeStatus; doorTagCount: number }>) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  }
  // Grid: Equipment | Status | Driver | Scheduled | Completed | Door Tags.
  // Status sits second so a CSR scanning a row reads "this piece of
  // equipment is in state X, owned by driver Y, scheduled for Z, completed
  // on W" left-to-right. Used by header + each row so column boundaries
  // always line up.
  const gridCols = "minmax(0, 1.3fr) minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 110px";
  // Always include the row's current status in the picker — handles legacy
  // values (HELD_FOR_AUTH, DOOR_TAG, etc.) that were dropped from the
  // picker list but still exist on rows in the DB.
  function pickerValuesFor(current: OutcomeStatus): OutcomeStatus[] {
    return DELIVERY_STATUS_PICKER_VALUES.includes(current)
      ? [...DELIVERY_STATUS_PICKER_VALUES]
      : [current, ...DELIVERY_STATUS_PICKER_VALUES];
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          gap: 8,
          padding: "0 10px",
          fontSize: 11,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "#64748d",
        }}
      >
        <span>Equipment</span>
        <span>Equipment Delivery Status</span>
        <span>Driver</span>
        <span>Scheduled Delivery Date</span>
        <span>Completed Date</span>
        <span>Door Tags</span>
      </div>
      {items.map((it, idx) => {
        const eq = equipmentLookup.find((e) => e.id === it.equipmentId);
        const label = eq ? `${eq.name}${it.quantity > 1 ? ` ×${it.quantity}` : ""}` : `Unknown equipment (${it.equipmentId.slice(0, 8)})`;
        return (
          <div
            key={it.equipmentId}
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              gap: 8,
              padding: "8px 10px",
              background: "#f6f9fc",
              border: "1px solid #e5edf5",
              borderRadius: 4,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#061b31", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {label}
              </div>
              {eq?.abbreviation && (
                <div style={{ fontSize: 11, color: "#64748d", fontFamily: "SourceCodePro, ui-monospace, monospace" }}>
                  {eq.abbreviation}{eq.hcpcsCode ? ` · ${eq.hcpcsCode}` : ""}
                </div>
              )}
            </div>
            <select
              value={it.deliveryStatus}
              onChange={(e) => patch(idx, { deliveryStatus: e.target.value as OutcomeStatus })}
              style={{
                padding: "6px 8px",
                fontSize: 13,
                color: "#273951",
                background: "#fff",
                border: "1px solid #e5edf5",
                borderRadius: 4,
              }}
              aria-label="Equipment delivery status"
            >
              {pickerValuesFor(it.deliveryStatus).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <select
              value={it.driverId ?? ""}
              onChange={(e) => patch(idx, { driverId: e.target.value ? Number(e.target.value) : null })}
              style={{
                padding: "6px 8px",
                fontSize: 13,
                color: "#273951",
                background: "#fff",
                border: "1px solid #e5edf5",
                borderRadius: 4,
              }}
            >
              <option value="">Unassigned</option>
              {driverLookup.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={it.scheduledDeliveryDate}
              onChange={(e) => patch(idx, { scheduledDeliveryDate: e.target.value })}
              style={{
                padding: "6px 8px",
                fontSize: 13,
                color: "#273951",
                background: "#fff",
                border: "1px solid #e5edf5",
                borderRadius: 4,
                fontFeatureSettings: '"tnum"',
              }}
              aria-label="Scheduled delivery date"
            />
            <input
              type="date"
              value={it.completedAt}
              onChange={(e) => patch(idx, { completedAt: e.target.value })}
              style={{
                padding: "6px 8px",
                fontSize: 13,
                color: "#273951",
                background: "#fff",
                border: "1px solid #e5edf5",
                borderRadius: 4,
                fontFeatureSettings: '"tnum"',
              }}
              aria-label="Completed date"
            />
            <DoorTagStepper
              value={it.doorTagCount}
              onChange={(next) => patch(idx, { doorTagCount: next })}
            />
          </div>
        );
      })}
    </div>
  );
}

// Touch-friendly ±/count stepper. Floors at 0; no upper cap (rare but
// possible for an item to need multiple attempts). Clicking the count
// itself focuses the buttons' parent — we don't surface a free-form
// numeric input because mistyping a 4-digit count by accident is the
// usual failure mode of those.
function DoorTagStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  function decrement() {
    onChange(Math.max(0, value - 1));
  }
  function increment() {
    onChange(value + 1);
  }
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0,
        border: "1px solid #e5edf5",
        borderRadius: 4,
        background: "#fff",
        overflow: "hidden",
      }}
      aria-label="Door tag count"
    >
      <button
        type="button"
        onClick={decrement}
        disabled={value === 0}
        title="Remove one door tag"
        style={{
          padding: "6px 10px",
          fontSize: 14,
          fontWeight: 600,
          color: value === 0 ? "#cbd5e1" : "#64748d",
          background: "transparent",
          border: 0,
          cursor: value === 0 ? "default" : "pointer",
        }}
      >
        −
      </button>
      <span
        style={{
          minWidth: 28,
          textAlign: "center",
          fontSize: 13,
          fontWeight: 500,
          color: value > 0 ? "#9b6829" : "#273951",
          fontFeatureSettings: '"tnum"',
        }}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={increment}
        title="Record a door tag for this item"
        style={{
          padding: "6px 10px",
          fontSize: 14,
          fontWeight: 600,
          color: "#64748d",
          background: "transparent",
          border: 0,
          cursor: "pointer",
        }}
      >
        +
      </button>
    </div>
  );
}

function ReadonlyDate({ label, iso }: { label: string; iso: string | null }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "#273951",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        className="px-3 py-2 text-[13px]"
        style={{
          background: "#f6f9fc",
          border: "1px solid #e5edf5",
          borderRadius: 4,
          color: iso ? "#061b31" : "#94a3b8",
          minHeight: 36,
          display: "flex",
          alignItems: "center",
        }}
      >
        {formatBriefingDate(iso) ?? "—"}
      </div>
    </div>
  );
}

// Stage 1 stores these as date-only ISO ("2026-06-04") via <input type="date">,
// which is timezone-naive. Render in UTC here so a user in EDT doesn't see
// "Jun 3" when Stage 1 captured "Jun 4". Match formatOrderDate / formatDc.
function formatBriefingDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
