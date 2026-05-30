"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, AlertTriangle, Send, CheckCircle2, DoorClosed, Plus, Printer, Truck } from "lucide-react";
import {
  BILLING_LABELS,
  DATA_ENTRY_LABELS,
  PLAN_TYPE_LABELS,
  STAGE_COLORS,
  STAGE_LABELS,
  STATUS_LABELS,
  WORK_ORDER_TYPE_COLORS,
  WORK_ORDER_TYPE_LABELS,
  isBlockingStatus,
  isServiceCallType,
  requiresReason,
  type OrderShape,
} from "@/lib/order-types";
import type { BillingStatus, DataEntryStatus, OutcomeStatus, PlanType, WorkOrderType } from "@prisma/client";
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
  AuthStatusSelect,
  ChipMulti,
  FacilitySelect,
  InsuranceSelect,
  SearchSelect,
  SegmentedSelect,
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
  const [whatsNeeded, setWhatsNeeded] = useState<string[]>(initial?.whatsNeeded ?? []);
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
  const [planMemberId, setPlanMemberId] = useState(initial?.planMemberId ?? "");
  const [planName, setPlanName] = useState(initial?.planName ?? "");
  const [planType, setPlanType] = useState<PlanType | null>(initial?.planType ?? null);
  const [authStatus, setAuthStatus] = useState<OrderShape["authStatus"]>(initial?.authStatus ?? "NOT_REQ");
  const [dosSubmitted, setDosSubmitted] = useState(initial?.dosSubmitted?.slice(0, 10) ?? "");
  const [dataEntryStatus, setDataEntryStatus] = useState<DataEntryStatus | null>(initial?.dataEntryStatus ?? null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(initial?.billingStatus ?? null);

  const [companies, setCompanies] = useState<string[]>(initial?.fulfillmentCompanies ?? []);
  const [handler, setHandler] = useState<OrderShape["handler"]>(initial?.handler ?? null);
  const [dischargeDate, setDischargeDate] = useState(initial?.dischargeDate?.slice(0, 10) ?? "");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState(
    initial?.requestedDeliveryDate?.slice(0, 10) ?? "",
  );
  const [deliveredDate, setDeliveredDate] = useState(initial?.deliveredAt?.slice(0, 10) ?? "");
  const [dispatcherId, setDispatcherId] = useState<number | null>(initial?.dispatcherId ?? null);
  const [items, setItems] = useState<Array<{ equipmentId: string; quantity: number }>>(
    initial?.items.map((it) => ({ equipmentId: it.equipmentId, quantity: it.quantity })) ?? [],
  );
  const [noteDraft, setNoteDraft] = useState("");

  const [status, setStatus] = useState<OutcomeStatus>(initial?.status ?? "ACTIVE");
  const [statusReason, setStatusReason] = useState(initial?.cancellationReason ?? "");

  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState("");

  const [step, setStep] = useState(1);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleWhatsNeeded(key: string) {
    setWhatsNeeded((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }
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
          csrId,
          patientFirst,
          patientLast,
          facilityId,
          whatsNeeded,
          callReceivedDate: callReceivedDate || null,
          dischargeDate: dischargeDate || null,
          requestedDeliveryDate: requestedDeliveryDate || null,
          // Verification (Stage 2) — optional at create; fillable all at once.
          primaryInsuranceKey: primary,
          secondaryInsuranceKey: secondary,
          deductibleStatus: deductible,
          coinsurancePct: coinsurancePct.trim() === "" ? null : Number(coinsurancePct),
          deductibleAmount: deductibleAmount.trim() === "" ? null : Number(deductibleAmount),
          planMemberId: planMemberId.trim() === "" ? null : planMemberId.trim(),
          planName: planName.trim() === "" ? null : planName.trim(),
          planType,
          authStatus,
          dosSubmitted: dosSubmitted || null,
          dataEntryStatus,
          billingStatus,
          // Fulfillment & dispatch (Stage 3) — optional at create.
          fulfillmentCompanies: companies,
          handler,
          dispatcherId,
          deliveredAt: deliveredDate || null,
          status,
          cancellationReason: statusReason || null,
          items,
          noteToAdd: noteDraft.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create order.");
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
          csrId,
          patientFirst,
          patientLast,
          facilityId,
          whatsNeeded,
          callReceivedDate: callReceivedDate || null,
          primaryInsuranceKey: primary,
          secondaryInsuranceKey: secondary,
          deductibleStatus: deductible,
          coinsurancePct: coinsurancePct.trim() === "" ? null : Number(coinsurancePct),
          deductibleAmount: deductibleAmount.trim() === "" ? null : Number(deductibleAmount),
          planMemberId: planMemberId.trim() === "" ? null : planMemberId.trim(),
          planName: planName.trim() === "" ? null : planName.trim(),
          planType,
          authStatus,
          dosSubmitted: dosSubmitted || null,
          dataEntryStatus,
          billingStatus,
          fulfillmentCompanies: companies,
          handler,
          dischargeDate: dischargeDate || null,
          requestedDeliveryDate: requestedDeliveryDate || null,
          deliveredAt: deliveredDate || null,
          dispatcherId,
          items,
          noteToAdd: noteDraft.trim() || null,
          status,
          cancellationReason: statusReason,
          ...extra,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save order.");
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
        setError(data.error ?? "Could not create pickup.");
        return;
      }
      setJustSaved(true);
      savedTimerRef.current = setTimeout(() => onSaved(data.order as OrderShape), 700);
    } finally {
      setSaving(false);
    }
  }

  const signatureWarning =
    authStatus === "READY_TO_SUBMIT" && whatsNeeded.includes("SIG")
      ? "Signature is still listed under What's Still Needed. Auth payers typically require a signed face sheet before submission."
      : null;

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
    if (o.stage === "READY_TO_ASSIGN" && dispatcherId && !o.printedAt) {
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
    if (o.stage === "OUT_FOR_DELIVERY") {
      buttons.push(
        <ActionBtn
          key="door-tag"
          icon={<DoorClosed size={14} />}
          label="Door Tag"
          tone="ghost"
          onClick={() => handleSave({ action: "door_tag" })}
        />,
      );
    }
    if (o.stage === "DOOR_TAG") {
      buttons.push(
        <ActionBtn
          key="retry-out"
          icon={<Truck size={14} />}
          label="Retry Delivery"
          tone="primary"
          onClick={() => handleSave({ action: "out_for_delivery" })}
        />,
      );
    }
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
      <div className="absolute inset-0" onClick={onClose} />
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
            onClick={onClose}
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
              {isCreate && (
                <div className="mb-3">
                  <SearchSelect
                    label="Work Order Type"
                    value={workOrderType}
                    onChange={(v) => setWorkOrderType((v as WorkOrderType) ?? "DELIVERY")}
                    options={(Object.keys(WORK_ORDER_TYPE_LABELS) as WorkOrderType[]).map((k) => ({
                      value: k,
                      label: WORK_ORDER_TYPE_LABELS[k],
                    }))}
                  />
                </div>
              )}
              {!isCreate && initial?.linkedOrderNumber && (
                <div className="mb-2 text-[11px]" style={{ color: "#64748d" }}>
                  Linked to order {initial.linkedOrderNumber}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
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
                <UserSelect
                  label="CSR"
                  value={csrId}
                  onChange={setCsrId}
                  options={lookups.csrs}
                  required
                />
                <div style={{ gridColumn: "1 / -1" }}>
                  <FacilitySelect
                    label="Facility"
                    value={facilityId}
                    onChange={setFacilityId}
                    options={lookups.facilities}
                    required
                  />
                </div>
                <Input
                  label="Order Date"
                  type="date"
                  value={callReceivedDate}
                  onChange={setCallReceivedDate}
                />
                <Input
                  label="Discharge Date"
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
                  <Label>Equipment Being Ordered</Label>
                  <EquipmentPicker
                    equipment={lookups.equipment}
                    value={items}
                    onChange={setItems}
                  />
                </div>
              </div>
            </Section>
          )}

          {step === 2 && (
            <Section
              title="Stage 2 — Verification"
              subtitle="Insurance, deductible, authorization, and any items still needed before dispatch."
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
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
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
                <Input
                  label="Plan ID"
                  value={planMemberId}
                  onChange={(v) => setPlanMemberId(v.replace(/[^\d]/g, "").slice(0, 20))}
                  inputMode="numeric"
                  placeholder="10183281800"
                />
                <SegmentedSelect
                  label="Plan Type"
                  value={planType}
                  onChange={(v) => setPlanType((v as PlanType | null) ?? null)}
                  options={(Object.keys(PLAN_TYPE_LABELS) as PlanType[]).map((k) => ({
                    value: k,
                    label: PLAN_TYPE_LABELS[k],
                  }))}
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <Input
                  label="Plan Name"
                  value={planName}
                  onChange={setPlanName}
                  placeholder="HAP Medicare Superior (HMO) Individual Plan 028"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
                <SegmentedSelect
                  label="Deductible Met?"
                  value={deductible}
                  onChange={(v) => setDeductible(v as "MET" | "NOT_MET" | "NA" | null)}
                  options={[
                    { value: "MET", label: "Met" },
                    { value: "NOT_MET", label: "Not Met" },
                    { value: "NA", label: "N/A" },
                  ]}
                />
                <div>
                  <AuthStatusSelect
                    value={authStatus}
                    from={initial?.authStatus ?? "NOT_REQ"}
                    onChange={setAuthStatus}
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
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
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
              </div>

              {authStatus !== "NOT_REQ" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
                  <Input
                    label="DOS Submitted"
                    type="date"
                    value={dosSubmitted}
                    onChange={setDosSubmitted}
                  />
                  <SearchSelect
                    label="Data Entry"
                    value={dataEntryStatus}
                    onChange={(v) => setDataEntryStatus((v as DataEntryStatus | null) ?? null)}
                    options={(Object.keys(DATA_ENTRY_LABELS) as DataEntryStatus[]).map((k) => ({
                      value: k,
                      label: DATA_ENTRY_LABELS[k],
                    }))}
                  />
                  <SearchSelect
                    label="Billing"
                    value={billingStatus}
                    onChange={(v) => setBillingStatus((v as BillingStatus | null) ?? null)}
                    options={(Object.keys(BILLING_LABELS) as BillingStatus[]).map((k) => ({
                      value: k,
                      label: BILLING_LABELS[k],
                    }))}
                  />
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
                <div>
                  <Label>What&apos;s Still Needed</Label>
                  <ChipMulti
                    options={lookups.whatsNeeded.map((w) => ({ key: w.key, label: w.label }))}
                    value={whatsNeeded}
                    onToggle={toggleWhatsNeeded}
                    placeholder="Search items still needed…"
                  />
                </div>
                <div>
                  <Label>Fulfillment Companies</Label>
                  <ChipMulti
                    options={lookups.companies.map((c) => ({ key: c.key, label: c.label }))}
                    value={companies}
                    onToggle={toggleCompany}
                    placeholder="Search companies to add…"
                  />
                </div>
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

              <SubHeader label="2 · Assign" first={isCreate} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                {isBlockingStatus(status) ? (
                  <DispatcherLocked statusLabel={STATUS_LABELS[status]} />
                ) : (
                  <UserSelect
                    label="Dispatcher"
                    value={dispatcherId}
                    onChange={setDispatcherId}
                    options={lookups.dispatchers}
                  />
                )}
                <SegmentedSelect
                  label="Handler"
                  value={handler}
                  onChange={(v) => setHandler(v as OrderShape["handler"])}
                  options={[
                    { value: "INTERNAL", label: "Internal" },
                    { value: "REP",      label: "Rep" },
                    { value: "FACILITY", label: "Facility" },
                  ]}
                />
              </div>

              <SubHeader label="3 · Schedule" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                <ReadonlyDate
                  label="Discharge Date"
                  iso={isCreate ? (dischargeDate || null) : (initial as OrderShape).dischargeDate}
                />
                <ReadonlyDate
                  label="Requested Delivery"
                  iso={isCreate ? (requestedDeliveryDate || null) : (initial as OrderShape).requestedDeliveryDate}
                />
                <Input
                  label="Delivery Date"
                  type="date"
                  value={deliveredDate}
                  onChange={setDeliveredDate}
                />
              </div>

              <SubHeader label="4 · Outcome" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                <SearchSelect
                  label="Status"
                  value={status}
                  onChange={(v) => {
                    const next = (v ?? "ACTIVE") as OutcomeStatus;
                    setStatus(next);
                    if (!requiresReason(next)) setStatusReason("");
                  }}
                  options={(Object.keys(STATUS_LABELS) as OutcomeStatus[]).map((k) => ({
                    value: k,
                    label: STATUS_LABELS[k],
                  }))}
                />
                {requiresReason(status) && (
                  <SearchSelect
                    label="Reason"
                    required
                    value={statusReason || null}
                    onChange={(v) => setStatusReason(v ?? "")}
                    options={lookups.cancellationReasons.map((r) => ({
                      value: r.label,
                      label: r.label,
                    }))}
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

function formatBriefingDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
