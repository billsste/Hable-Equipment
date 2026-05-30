"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Trash2, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { ALLOWED_MIME_TYPES, MAX_ATTACHMENTS_PER_ORDER, MAX_ATTACHMENT_BYTES, humanSize } from "@/lib/attachments";

type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedByName: string | null;
  uploadedById: number | null;
};

// Renders the attachment list + upload dropzone for one order. Reads the
// list from /api/tracker/orders/[id]/attachments and posts file uploads to
// the same endpoint. The server enforces size/mime/count caps; we mirror them
// in the UI just to give immediate feedback before the round-trip.
export default function OrderAttachments({ orderId }: { orderId: string }) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tracker/orders/${orderId}/attachments`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => { if (!cancelled) setItems(d.attachments ?? []); })
      .catch(() => { if (!cancelled) setError("Could not load attachments."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orderId]);

  async function upload(file: File) {
    setError(null);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`File too large. Max ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`);
      return;
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError(`File type not allowed. Accepted: PDF, PNG, JPG, HEIC, WebP, TXT.`);
      return;
    }
    if (items.length >= MAX_ATTACHMENTS_PER_ORDER) {
      setError(`Up to ${MAX_ATTACHMENTS_PER_ORDER} attachments per order.`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/tracker/orders/${orderId}/attachments`, {
        method: "POST",
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Upload failed."); return; }
      setItems((prev) => [d.attachment, ...prev]);
    } finally { setUploading(false); }
  }

  async function remove(id: string, filename: string) {
    if (!confirm(`Remove ${filename}? This cannot be undone.`)) return;
    const r = await fetch(`/api/tracker/orders/${orderId}/attachments/${id}`, { method: "DELETE" });
    if (r.ok) setItems((prev) => prev.filter((a) => a.id !== id));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) upload(f);
  }

  return (
    <div>
      {/* Dropzone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          border: `1px dashed ${dragOver ? "#533afd" : "#cbd5e1"}`,
          background: dragOver ? "rgba(83,58,253,0.04)" : "#f8fafc",
          borderRadius: 6, padding: 16, textAlign: "center", cursor: "pointer",
          transition: "background 100ms, border-color 100ms",
        }}
      >
        {uploading ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#64748d" }}>
            <Loader2 size={14} className="animate-spin" /> Uploading...
          </span>
        ) : (
          <>
            <Upload size={18} style={{ color: "#94a3b8", marginBottom: 4 }} />
            <div style={{ fontSize: 13, color: "#273951", marginBottom: 2 }}>
              Drop a file or <span style={{ color: "#533afd", fontWeight: 500 }}>click to browse</span>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              PDF, PNG, JPG, HEIC, WebP, TXT · up to {Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB · {items.length} of {MAX_ATTACHMENTS_PER_ORDER}
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_MIME_TYPES.join(",")}
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <div style={{ marginTop: 8, padding: "6px 10px", fontSize: 12, color: "#b03238", background: "rgba(229,72,77,0.08)", border: "1px solid rgba(229,72,77,0.25)", borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8" }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8" }}>No attachments yet.</div>
      ) : (
        <ul style={{ marginTop: 12, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((a) => (
            <li
              key={a.id}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#fff", border: "1px solid #e5edf5", borderRadius: 4 }}
            >
              <FileIcon mime={a.mimeType} />
              <a
                href={`/api/tracker/orders/${orderId}/attachments/${a.id}`}
                style={{ flex: 1, fontSize: 13, color: "#4434d4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={a.filename}
              >
                {a.filename}
              </a>
              <span style={{ fontSize: 11, color: "#64748d", fontFeatureSettings: '"tnum"' }}>{humanSize(a.size)}</span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                {a.uploadedByName ?? "—"} · {new Date(a.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              <button
                type="button"
                onClick={() => remove(a.id, a.filename)}
                style={{ background: "transparent", border: 0, color: "#b03238", cursor: "pointer", padding: 4 }}
                title="Remove"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <ImageIcon size={16} style={{ color: "#1f5e8a", flexShrink: 0 }} />;
  return <FileText size={16} style={{ color: "#64748d", flexShrink: 0 }} />;
}
