"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import { Label } from "@/components/form-primitives";

type Me = {
  id: number;
  name: string;
  email: string;
  role: "supplier" | "driver" | "csr";
};

type SupportTab = "new" | "history";
type TicketType = "issue" | "enhancement" | "question";
type TicketPriority = "low" | "normal" | "high" | "urgent";

type TicketAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  file?: File;
};

type TicketSummary = {
  id: number;
  ticket_number: string;
  subject: string;
  status: string;
  ticket_type: string | null;
  manual_type: string | null;
  complexity: string | null;
  priority?: string | null;
  created_at: string;
  submitter_email?: string | null;
  submitter_name?: string | null;
  description?: string | null;
  page_url?: string | null;
  photos?: string[] | null;
};

type TicketComment = {
  id: number | null;
  actor: string;
  action: string;
  content: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string | null;
};

type TicketDetail = {
  id: number;
  ticket_number: string;
  subject: string;
  description: string;
  status: string;
  priority: string | null;
  ticket_type: string | null;
  manual_type: string | null;
  complexity: string | null;
  created_at: string;
  updated_at?: string | null;
  page_url?: string | null;
  photos: string[];
};

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

const TICKET_TYPES: Array<{ value: TicketType; label: string }> = [
  { value: "issue", label: "Bug / Issue" },
  { value: "enhancement", label: "Enhancement" },
  { value: "question", label: "Question" },
];

const PRIORITIES: Array<{ value: TicketPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const AREA_OPTIONS = [
  { value: "tracker", label: "Tracker / orders" },
  { value: "configuration", label: "Configuration / lookups" },
  { value: "users", label: "Users / access" },
  { value: "audit", label: "Audit log" },
  { value: "login", label: "Login / access" },
  { value: "general", label: "General" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function ticketTypeLabel(type: string | null | undefined) {
  const n = String(type ?? "").toLowerCase();
  if (n === "issue" || n === "bug") return "Bug / Issue";
  if (n === "enhancement" || n === "feature" || n === "improvement") return "Enhancement";
  if (n === "question") return "Question";
  return "General";
}

function statusLabel(status: string | null | undefined) {
  const n = String(status ?? "").toLowerCase();
  if (n === "open") return "Open";
  if (n === "in_progress") return "In Progress";
  if (n === "waiting") return "Waiting";
  if (n === "resolved") return "Resolved";
  if (n === "closed") return "Closed";
  if (n === "human_review") return "Human Review";
  return n || "Open";
}

function priorityLabel(priority: string | null | undefined) {
  const n = String(priority ?? "").toLowerCase();
  if (!n) return "Normal";
  return n.charAt(0).toUpperCase() + n.slice(1);
}

type Tone = { bg: string; color: string; border: string };

function priorityTone(priority: string | null | undefined): Tone {
  const n = String(priority ?? "").toLowerCase();
  if (n === "urgent") return { bg: "rgba(229,72,77,0.10)", color: "#b03238", border: "rgba(229,72,77,0.30)" };
  if (n === "high") return { bg: "rgba(229,143,72,0.14)", color: "#9b5a29", border: "rgba(229,143,72,0.30)" };
  if (n === "low") return { bg: "rgba(100,116,141,0.10)", color: "#64748d", border: "rgba(100,116,141,0.20)" };
  return { bg: "rgba(83,58,253,0.08)", color: "#4434d4", border: "rgba(83,58,253,0.20)" };
}

function statusTone(status: string | null | undefined): Tone {
  const n = String(status ?? "").toLowerCase();
  if (n === "resolved" || n === "closed") return { bg: "rgba(21,190,83,0.14)", color: "#108c3d", border: "rgba(21,190,83,0.30)" };
  if (n === "waiting") return { bg: "rgba(155,104,41,0.14)", color: "#9b6829", border: "rgba(155,104,41,0.30)" };
  if (n === "in_progress") return { bg: "rgba(83,58,253,0.08)", color: "#4434d4", border: "rgba(83,58,253,0.20)" };
  if (n === "human_review") return { bg: "rgba(40,116,173,0.14)", color: "#2874ad", border: "rgba(40,116,173,0.30)" };
  return { bg: "rgba(83,58,253,0.08)", color: "#4434d4", border: "rgba(83,58,253,0.20)" };
}

function parseSubmittedTicketBody(raw: string) {
  const normalized = raw.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  let type = "";
  let priority = "";
  let area = "";
  const descriptionLines: string[] = [];
  const stepsLines: string[] = [];
  let mode: "description" | "steps" | "attachments" = "description";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("Type:")) { type = trimmed.replace("Type:", "").trim(); continue; }
    if (trimmed.startsWith("Priority:")) { priority = trimmed.replace("Priority:", "").trim(); continue; }
    if (trimmed.startsWith("Area:")) { area = trimmed.replace("Area:", "").trim(); continue; }
    if (trimmed === "Steps to Reproduce:") { mode = "steps"; continue; }
    if (trimmed === "Attachments:") { mode = "attachments"; continue; }
    if (mode === "steps") stepsLines.push(trimmed);
    else if (mode === "description") descriptionLines.push(trimmed);
  }
  return {
    type,
    priority,
    area,
    description: descriptionLines.join("\n\n"),
    steps: stepsLines.join("\n"),
  };
}

function attachmentLabelFromUrl(url: string) {
  try {
    const parsed = new URL(url, "http://localhost");
    const nestedFile = parsed.searchParams.get("file");
    const source = nestedFile ? decodeURIComponent(nestedFile) : url;
    try {
      const sourceUrl = new URL(source, "http://localhost");
      const fileName = sourceUrl.pathname.split("/").pop();
      return fileName || source;
    } catch {
      return source.split("/").pop() || source;
    }
  } catch {
    return url.split("/").pop() || url;
  }
}

function summarizeDescription(raw: string | null | undefined) {
  if (!raw) return "";
  const parsed = parseSubmittedTicketBody(raw);
  const source = parsed.description || raw;
  const collapsed = source.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 140) return collapsed;
  return `${collapsed.slice(0, 137).trimEnd()}...`;
}

export default function SupportPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [activeTab, setActiveTab] = useState<SupportTab>("new");
  const [ticketType, setTicketType] = useState<TicketType>("issue");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [area, setArea] = useState("tracker");
  const [pageUrl, setPageUrl] = useState("");
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [cancelingTicket, setCancelingTicket] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((data) => setMe(data.user ?? null))
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPageUrl(window.location.href);
  }, []);

  useEffect(() => {
    if (activeTab === "history") void loadTickets();
  }, [activeTab]);

  const submitValidationMessage = useMemo(() => {
    if (subject.trim().length < 3 && description.trim().length < 5) {
      return "Add a short subject and description before submitting.";
    }
    if (subject.trim().length < 3) return "Add a short subject before submitting.";
    if (description.trim().length < 5) return "Add a bit more detail in the description.";
    return "";
  }, [subject, description]);

  const ticketContent = useMemo(
    () => (ticketDetail ? parseSubmittedTicketBody(ticketDetail.description || "") : null),
    [ticketDetail],
  );

  async function loadTickets(preferredId?: number | null) {
    setTicketsLoading(true);
    try {
      const response = await fetch("/api/support/tickets", { cache: "no-store", credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Failed to load support tickets.");
        return;
      }
      const next = (data.tickets ?? []) as TicketSummary[];
      setTickets(next);
      const nextSelected = preferredId && next.some((t) => t.id === preferredId) ? preferredId : null;
      setSelectedTicketId(nextSelected);
      if (!nextSelected) {
        setTicketDetail(null);
        setComments([]);
        setDetailModalOpen(false);
      }
    } finally {
      setTicketsLoading(false);
    }
  }

  async function openTicket(ticketId: number) {
    setSelectedTicketId(ticketId);
    setDetailLoading(true);
    setCommentError("");
    try {
      const [detailResponse, commentsResponse] = await Promise.all([
        fetch(`/api/support/tickets/${ticketId}`, { cache: "no-store", credentials: "same-origin" }),
        fetch(`/api/support/tickets/${ticketId}/comments`, { cache: "no-store", credentials: "same-origin" }),
      ]);
      const detailData = await detailResponse.json().catch(() => ({}));
      const commentsData = await commentsResponse.json().catch(() => ({}));
      if (detailResponse.ok) {
        setTicketDetail(detailData.ticket ?? null);
        setDetailModalOpen(true);
      }
      if (commentsResponse.ok) setComments(commentsData.comments ?? []);
    } finally {
      setDetailLoading(false);
    }
  }

  function resetForm() {
    setTicketType("issue");
    setPriority("normal");
    setSubject("");
    setDescription("");
    setSteps("");
    setArea("tracker");
    setAttachments([]);
    setError("");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const next = [...attachments];
    let attachmentError = "";
    for (const file of files) {
      if (next.length >= MAX_ATTACHMENTS) {
        attachmentError = `You can attach up to ${MAX_ATTACHMENTS} files.`;
        break;
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        attachmentError = `${file.name} is too large. Keep attachments under 5 MB.`;
        continue;
      }
      next.push({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        file,
      });
    }
    setAttachments(next);
    setError(attachmentError);
    event.target.value = "";
  }

  function removeAttachment(id: string) {
    setAttachments((curr) => curr.filter((a) => a.id !== id));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!me) return;
    if (submitValidationMessage) {
      setError(submitValidationMessage);
      setSuccess("");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const formData = new FormData();
      formData.set("type", ticketType);
      formData.set("priority", priority);
      formData.set("subject", subject);
      formData.set("description", description);
      formData.set("steps", steps);
      formData.set("area", area);
      formData.set("pageUrl", pageUrl);
      attachments.forEach((a) => { if (a.file) formData.append("attachments", a.file); });
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          response.status === 401
            ? "Your session expired. Please sign in again, then resubmit the ticket."
            : data.error ?? "Support request could not be submitted.",
        );
        return;
      }
      setSuccess(
        data.ticketNumber
          ? `Support ticket ${data.ticketNumber} submitted.`
          : "Support ticket submitted.",
      );
      resetForm();
      setActiveTab("history");
      await loadTickets(data.id ?? null);
    } finally {
      setSubmitting(false);
    }
  }

  async function postComment() {
    if (!selectedTicketId || !commentText.trim()) return;
    setPostingComment(true);
    setCommentError("");
    try {
      const response = await fetch(`/api/support/tickets/${selectedTicketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ content: commentText.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCommentError(data.error ?? "Failed to add comment.");
        return;
      }
      setComments(data.comments ?? []);
      setCommentText("");
      await loadTickets(selectedTicketId);
    } finally {
      setPostingComment(false);
    }
  }

  async function cancelSelectedTicket() {
    if (!selectedTicketId || cancelingTicket) return;
    const confirmed = window.confirm("Cancel this support ticket? The history will be preserved.");
    if (!confirmed) return;
    setCancelingTicket(true);
    setCommentError("");
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/support/tickets/${selectedTicketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCommentError(data.error ?? "Failed to cancel support ticket.");
        return;
      }
      setCommentText("");
      setSuccess("Support ticket cancelled.");
      await loadTickets(selectedTicketId);
    } finally {
      setCancelingTicket(false);
    }
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
            Support
          </h1>
          <p className="mt-1 text-[14px]" style={{ color: "#64748d", fontWeight: 300 }}>
            File a ticket for bugs, enhancements, or questions. Each ticket is logged into the engineering queue and updated here as it moves.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1" style={{ marginBottom: 12 }}>
        <TabButton active={activeTab === "new"} label="New Ticket" onClick={() => setActiveTab("new")} />
        <TabButton
          active={activeTab === "history"}
          label={`My Tickets${tickets.length ? ` (${tickets.length})` : ""}`}
          onClick={() => setActiveTab("history")}
        />
      </div>

      {activeTab === "new" ? (
        <NewTicketForm
          me={me}
          ticketType={ticketType}
          setTicketType={setTicketType}
          priority={priority}
          setPriority={setPriority}
          area={area}
          setArea={setArea}
          subject={subject}
          setSubject={setSubject}
          description={description}
          setDescription={setDescription}
          steps={steps}
          setSteps={setSteps}
          attachments={attachments}
          onFileChange={handleFileChange}
          onRemoveAttachment={removeAttachment}
          onSubmit={handleSubmit}
          submitting={submitting}
          error={error}
          success={success}
          submitValidationMessage={submitValidationMessage}
        />
      ) : (
        <TicketHistory
          tickets={tickets}
          ticketsLoading={ticketsLoading}
          selectedTicketId={selectedTicketId}
          onOpen={openTicket}
          commentError={commentError}
          success={success}
        />
      )}

      {detailModalOpen && ticketDetail && (
        <TicketDetailModal
          ticketDetail={ticketDetail}
          ticketContent={ticketContent}
          comments={comments}
          commentText={commentText}
          setCommentText={setCommentText}
          onPostComment={postComment}
          postingComment={postingComment}
          commentError={commentError}
          onCancelTicket={cancelSelectedTicket}
          cancelingTicket={cancelingTicket}
          detailLoading={detailLoading}
          onClose={() => setDetailModalOpen(false)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────────

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
      {label}
    </button>
  );
}

function NewTicketForm({
  me, ticketType, setTicketType, priority, setPriority, area, setArea,
  subject, setSubject, description, setDescription, steps, setSteps,
  attachments, onFileChange, onRemoveAttachment, onSubmit,
  submitting, error, success, submitValidationMessage,
}: {
  me: Me | null;
  ticketType: TicketType;
  setTicketType: (v: TicketType) => void;
  priority: TicketPriority;
  setPriority: (v: TicketPriority) => void;
  area: string;
  setArea: (v: string) => void;
  subject: string;
  setSubject: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  steps: string;
  setSteps: (v: string) => void;
  attachments: TicketAttachment[];
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: (id: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  error: string;
  success: string;
  submitValidationMessage: string;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5edf5",
        borderRadius: 6,
        boxShadow: "rgba(23,23,23,0.06) 0px 3px 6px",
        padding: 24,
      }}
    >
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
          <ReadonlyField label="Your name" value={me?.name ?? "Loading…"} />
          <ReadonlyField label="Email" value={me?.email ?? "Loading…"} />
        </div>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
          <ChipGroup
            label="Type"
            value={ticketType}
            options={TICKET_TYPES}
            onChange={(v) => setTicketType(v as TicketType)}
          />
          <ChipGroup
            label="Priority"
            value={priority}
            options={PRIORITIES}
            onChange={(v) => setPriority(v as TicketPriority)}
          />
        </div>

        <SelectField label="Area" value={area} onChange={setArea} options={AREA_OPTIONS} />

        <TextField
          label="Subject"
          value={subject}
          onChange={setSubject}
          placeholder="Brief summary of the issue or request"
          required
        />

        <TextAreaField
          label="Description"
          value={description}
          onChange={setDescription}
          placeholder="What happened, what you expected, and anything that helps reproduce."
          minHeight={140}
          required
        />

        <TextAreaField
          label="Steps to Reproduce"
          helper="Optional — helpful for bugs."
          value={steps}
          onChange={setSteps}
          placeholder="1. Go to...&#10;2. Click on...&#10;3. See issue..."
          minHeight={100}
        />

        <AttachmentPicker attachments={attachments} onChange={onFileChange} onRemove={onRemoveAttachment} />

        {error && (
          <Banner tone={{ bg: "rgba(229,72,77,0.08)", color: "#b03238", border: "rgba(229,72,77,0.30)" }} icon={<AlertTriangle size={14} />} message={error} />
        )}
        {success && (
          <Banner tone={{ bg: "rgba(21,190,83,0.14)", color: "#108c3d", border: "rgba(21,190,83,0.30)" }} icon={<CheckCircle2 size={14} />} message={success} />
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 4 }}>
          <button
            type="submit"
            disabled={submitting || Boolean(submitValidationMessage)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              color: "#ffffff",
              background: "#533afd",
              borderRadius: 4,
              opacity: submitting || submitValidationMessage ? 0.6 : 1,
              cursor: submitting || submitValidationMessage ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!submitting && !submitValidationMessage) (e.currentTarget as HTMLButtonElement).style.background = "#4434d4";
            }}
            onMouseLeave={(e) => {
              if (!submitting && !submitValidationMessage) (e.currentTarget as HTMLButtonElement).style.background = "#533afd";
            }}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Submit Ticket
          </button>
          {submitValidationMessage && (
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{submitValidationMessage}</span>
          )}
        </div>
      </form>
    </div>
  );
}

function TicketHistory({
  tickets, ticketsLoading, selectedTicketId, onOpen, commentError, success,
}: {
  tickets: TicketSummary[];
  ticketsLoading: boolean;
  selectedTicketId: number | null;
  onOpen: (id: number) => void;
  commentError: string;
  success: string;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5edf5",
        borderRadius: 6,
        boxShadow: "rgba(23,23,23,0.06) 0px 3px 6px",
        overflow: "hidden",
      }}
    >
      {commentError && (
        <div style={{ padding: 16, borderBottom: "1px solid #e5edf5" }}>
          <Banner tone={{ bg: "rgba(229,72,77,0.08)", color: "#b03238", border: "rgba(229,72,77,0.30)" }} icon={<AlertTriangle size={14} />} message={commentError} />
        </div>
      )}
      {success === "Support ticket cancelled." && (
        <div style={{ padding: 16, borderBottom: "1px solid #e5edf5" }}>
          <Banner tone={{ bg: "rgba(21,190,83,0.14)", color: "#108c3d", border: "rgba(21,190,83,0.30)" }} icon={<CheckCircle2 size={14} />} message={success} />
        </div>
      )}
      {ticketsLoading && tickets.length === 0 ? (
        <div style={{ padding: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Loader2 size={20} className="animate-spin" style={{ color: "#533afd" }} />
        </div>
      ) : tickets.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", fontSize: 13, color: "#64748d" }}>
          No tickets yet. Use the <strong style={{ color: "#273951" }}>New Ticket</strong> tab to file your first one.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f6f9fc", borderBottom: "1px solid #e5edf5" }}>
              {["Ticket", "Subject", "Type", "Priority", "Status", "Submitted"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "#64748d",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => {
              const isActive = selectedTicketId === t.id;
              return (
                <tr
                  key={t.id}
                  onClick={() => onOpen(t.id)}
                  style={{
                    borderBottom: "1px solid #e5edf5",
                    cursor: "pointer",
                    background: isActive ? "rgba(83,58,253,0.04)" : "#ffffff",
                    transition: "background-color 100ms",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "#f6f9fc";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "#ffffff";
                  }}
                >
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    <span
                      style={{
                        display: "inline-block",
                        fontFamily: "SourceCodePro, ui-monospace, SFMono-Regular, monospace",
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "rgba(83,58,253,0.08)",
                        color: "#4434d4",
                      }}
                    >
                      {t.ticket_number}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ color: "#061b31", fontWeight: 500 }}>{t.subject}</div>
                    {t.description && (
                      <div style={{ color: "#64748d", fontSize: 12, marginTop: 2 }}>
                        {summarizeDescription(t.description)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "#273951" }}>
                    {ticketTypeLabel(t.manual_type ?? t.ticket_type)}
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    <Pill label={priorityLabel(t.priority)} tone={priorityTone(t.priority)} />
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    <Pill label={statusLabel(t.status)} tone={statusTone(t.status)} />
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "#64748d", fontSize: 12 }}>
                    {formatDate(t.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TicketDetailModal({
  ticketDetail, ticketContent, comments, commentText, setCommentText,
  onPostComment, postingComment, commentError, onCancelTicket, cancelingTicket,
  detailLoading, onClose,
}: {
  ticketDetail: TicketDetail;
  ticketContent: ReturnType<typeof parseSubmittedTicketBody> | null;
  comments: TicketComment[];
  commentText: string;
  setCommentText: (v: string) => void;
  onPostComment: () => void;
  postingComment: boolean;
  commentError: string;
  onCancelTicket: () => void;
  cancelingTicket: boolean;
  detailLoading: boolean;
  onClose: () => void;
}) {
  const isClosed = statusLabel(ticketDetail.status) === "Closed" || statusLabel(ticketDetail.status) === "Resolved";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(6,27,49,0.4)" }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative z-10 max-h-[92vh] w-full max-w-[760px] overflow-hidden flex flex-col"
        style={{
          background: "#ffffff",
          borderRadius: 8,
          boxShadow:
            "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.10) 0px 18px 36px -18px",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #e5edf5",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "#533afd", letterSpacing: "0.05em", fontWeight: 500, textTransform: "uppercase" }}>
              {ticketDetail.ticket_number}
            </div>
            <h2 style={{ marginTop: 4, color: "#061b31", fontSize: 20, fontWeight: 300, letterSpacing: "-0.2px" }}>
              {ticketDetail.subject}
            </h2>
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ticketContent?.type && (
                <Pill label={ticketTypeLabel(ticketContent.type)} tone={{ bg: "rgba(83,58,253,0.08)", color: "#4434d4", border: "rgba(83,58,253,0.20)" }} />
              )}
              <Pill label={priorityLabel(ticketDetail.priority)} tone={priorityTone(ticketDetail.priority)} />
              <Pill label={statusLabel(ticketDetail.status)} tone={statusTone(ticketDetail.status)} />
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
              Submitted {formatDate(ticketDetail.created_at)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ padding: 6, color: "#64748d", borderRadius: 4 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f9fc")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", background: "#f6f9fc", minHeight: 0 }}>
          {detailLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748d", fontSize: 13, marginBottom: 12 }}>
              <Loader2 size={14} className="animate-spin" />
              Loading…
            </div>
          )}

          {ticketContent?.area && (
            <DetailCard title="Where it happened" content={ticketContent.area} />
          )}
          <DetailCard
            title="Description"
            content={ticketContent?.description || ticketDetail.description}
          />
          {ticketContent?.steps && (
            <DetailCard title="Steps to reproduce" content={ticketContent.steps} />
          )}

          <Section title="Attachments">
            {ticketDetail.photos?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {ticketDetail.photos.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      background: "#ffffff",
                      border: "1px solid #e5edf5",
                      borderRadius: 4,
                      textDecoration: "none",
                      fontSize: 13,
                      color: "#273951",
                    }}
                  >
                    <Paperclip size={14} style={{ color: "#64748d", flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {attachmentLabelFromUrl(url)}
                    </span>
                    <span style={{ fontSize: 11, color: "#533afd", fontWeight: 500 }}>Open</span>
                  </a>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>No attachments.</div>
            )}
          </Section>

          <Section title="Reply">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a follow-up note…"
              style={{
                width: "100%",
                minHeight: 100,
                padding: "8px 10px",
                fontSize: 13,
                border: "1px solid #e5edf5",
                borderRadius: 4,
                color: "#061b31",
                background: "#ffffff",
                resize: "vertical",
                outline: "none",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#533afd")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e5edf5")}
            />
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                onClick={onPostComment}
                disabled={postingComment || !commentText.trim()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#ffffff",
                  background: "#533afd",
                  borderRadius: 4,
                  opacity: postingComment || !commentText.trim() ? 0.6 : 1,
                  cursor: postingComment || !commentText.trim() ? "not-allowed" : "pointer",
                }}
              >
                {postingComment ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Send reply
              </button>
              {commentError && <span style={{ fontSize: 12, color: "#b03238" }}>{commentError}</span>}
            </div>
          </Section>

          {comments.length > 0 && (
            <Section title="Conversation">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {comments.map((c, i) => {
                  const isSystem = (c.actor || "").toLowerCase() === "system";
                  return (
                    <div
                      key={`${c.id ?? "comment"}-${i}`}
                      style={{
                        background: isSystem ? "rgba(155,104,41,0.06)" : "#ffffff",
                        border: `1px solid ${isSystem ? "rgba(155,104,41,0.25)" : "#e5edf5"}`,
                        borderRadius: 4,
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontSize: 13, color: "#061b31", fontWeight: 500 }}>
                          {c.actor || "Support"}
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 500,
                            padding: "1px 6px",
                            borderRadius: 4,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            background: isSystem ? "rgba(155,104,41,0.14)" : "rgba(83,58,253,0.08)",
                            color: isSystem ? "#9b6829" : "#4434d4",
                          }}
                        >
                          {isSystem ? "Status" : "Message"}
                        </span>
                      </div>
                      {c.created_at && (
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                          {formatDate(c.created_at)}
                        </div>
                      )}
                      <div style={{ marginTop: 6, fontSize: 13, color: "#273951", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                        {c.content || c.action}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid #e5edf5",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexShrink: 0,
            background: "#ffffff",
          }}
        >
          <button
            onClick={onCancelTicket}
            disabled={cancelingTicket || isClosed}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 500,
              background: "rgba(229,72,77,0.08)",
              color: "#b03238",
              border: "1px solid rgba(229,72,77,0.25)",
              borderRadius: 4,
              opacity: cancelingTicket || isClosed ? 0.5 : 1,
              cursor: cancelingTicket || isClosed ? "not-allowed" : "pointer",
            }}
          >
            {cancelingTicket ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
            Cancel ticket
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 500,
              background: "#ffffff",
              color: "#273951",
              border: "1px solid #e5edf5",
              borderRadius: 4,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Form primitives
// ──────────────────────────────────────────────────────────────────────────────

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div
        style={{
          padding: "8px 10px",
          fontSize: 13,
          color: "#64748d",
          background: "#f6f9fc",
          border: "1px solid #e5edf5",
          borderRadius: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function TextField({
  label, value, onChange, placeholder, required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          width: "100%",
          padding: "8px 10px",
          fontSize: 13,
          color: "#061b31",
          background: "#ffffff",
          border: "1px solid #e5edf5",
          borderRadius: 4,
          outline: "none",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "#533afd")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "#e5edf5")}
      />
    </div>
  );
}

function TextAreaField({
  label, helper, value, onChange, placeholder, minHeight, required,
}: {
  label: string;
  helper?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight: number;
  required?: boolean;
}) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      {helper && <div style={{ marginTop: -2, marginBottom: 6, fontSize: 11, color: "#94a3b8" }}>{helper}</div>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          width: "100%",
          minHeight,
          padding: "8px 10px",
          fontSize: 13,
          color: "#061b31",
          background: "#ffffff",
          border: "1px solid #e5edf5",
          borderRadius: 4,
          outline: "none",
          resize: "vertical",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "#533afd")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "#e5edf5")}
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 10px",
          fontSize: 13,
          color: "#061b31",
          background: "#ffffff",
          border: "1px solid #e5edf5",
          borderRadius: 4,
          outline: "none",
          appearance: "none",
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 4l3 3 3-3' fill='none' stroke='%2364748d' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 10px center",
          paddingRight: 32,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ChipGroup({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                ...(active
                  ? { background: "rgba(83,58,253,0.08)", color: "#4434d4", border: "1px solid rgba(83,58,253,0.20)" }
                  : { background: "#ffffff", color: "#64748d", border: "1px solid #e5edf5" }),
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AttachmentPicker({
  attachments, onChange, onRemove,
}: {
  attachments: TicketAttachment[];
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <Label>Attachments</Label>
      <label
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: 16,
          fontSize: 12,
          color: "#64748d",
          border: "1px dashed #e5edf5",
          borderRadius: 6,
          background: "#f6f9fc",
          cursor: "pointer",
        }}
      >
        <input
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.csv"
          onChange={onChange}
          style={{ display: "none" }}
        />
        <Paperclip size={16} style={{ color: "#94a3b8" }} />
        <div style={{ fontSize: 12, color: "#273951", fontWeight: 500 }}>Add screenshots or files</div>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>Up to 5 files, 5 MB each. PNG, JPG, PDF, etc.</div>
      </label>
      {attachments.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {attachments.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "6px 10px",
                background: "#ffffff",
                border: "1px solid #e5edf5",
                borderRadius: 4,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "#061b31", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.name}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{formatFileSize(a.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                style={{
                  padding: "3px 8px",
                  fontSize: 11,
                  color: "#64748d",
                  background: "#ffffff",
                  border: "1px solid #e5edf5",
                  borderRadius: 4,
                  fontWeight: 500,
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Banner({ tone, icon, message }: { tone: Tone; icon: React.ReactNode; message: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 10px",
        fontSize: 13,
        background: tone.bg,
        color: tone.color,
        border: `1px solid ${tone.border}`,
        borderRadius: 4,
      }}
    >
      <span style={{ marginTop: 2, flexShrink: 0 }}>{icon}</span>
      <span>{message}</span>
    </div>
  );
}

function Pill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 500,
        padding: "1px 6px",
        borderRadius: 4,
        background: tone.bg,
        color: tone.color,
        border: `1px solid ${tone.border}`,
      }}
    >
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#64748d",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function DetailCard({ title, content }: { title: string; content: string }) {
  return (
    <Section title={title}>
      <div
        style={{
          padding: "10px 12px",
          fontSize: 13,
          color: "#273951",
          background: "#ffffff",
          border: "1px solid #e5edf5",
          borderRadius: 4,
          whiteSpace: "pre-wrap",
          lineHeight: 1.5,
        }}
      >
        {content}
      </div>
    </Section>
  );
}
