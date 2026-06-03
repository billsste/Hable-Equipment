"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

type Me = {
  id: number;
  name: string;
  email: string;
  mustChangePassword: boolean;
};

export default function ChangePasswordClient({ me }: { me: Me }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== confirm) {
      setError("New password and confirmation don't match.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error ?? "Could not change password.");
        return;
      }
      // Success — redirect to Tracker; the next-page guard sees
      // mustChangePassword=false and won't bounce back here.
      window.location.assign("/tracker");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        fontFamily: "Inter, sohne-var, -apple-system, system-ui, sans-serif",
        background: "#f6f9fc",
      }}
    >
      <div
        className="w-full max-w-[440px] p-8"
        style={{
          background: "#fff",
          border: "1px solid #e5edf5",
          borderRadius: 8,
          boxShadow: "rgba(50,50,93,0.08) 0px 15px 35px, rgba(0,0,0,0.06) 0px 5px 15px",
        }}
      >
        <div className="mb-4 flex items-center gap-2" style={{ color: "#4434d4" }}>
          <ShieldCheck size={18} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Set your password</span>
        </div>
        <h1 className="mb-1.5" style={{ color: "#061b31", fontSize: 22, fontWeight: 300 }}>
          {me.mustChangePassword ? "Choose a new password" : "Change your password"}
        </h1>
        <p className="mb-6 text-[13px]" style={{ color: "#64748d" }}>
          {me.mustChangePassword
            ? `Welcome, ${me.name}. Before you can use EquipDispatch, please set your own password.`
            : "Pick a new password for your account."}
        </p>

        {error && (
          <div
            className="mb-4 px-3 py-2 text-[12px]"
            style={{
              background: "rgba(229,72,77,0.08)",
              color: "#b03238",
              border: "1px solid rgba(229,72,77,0.30)",
              borderRadius: 4,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <Field
            label="Current password"
            value={current}
            onChange={setCurrent}
            placeholder="•••••••••"
            autoFocus
          />
          <Field
            label="New password"
            value={next}
            onChange={setNext}
            placeholder="At least 8 chars, with upper, lower, number"
          />
          <Field
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            placeholder="•••••••••"
          />

          <button
            type="submit"
            disabled={busy || !current || !next || !confirm}
            className="flex w-full items-center justify-center gap-2 py-2 text-[13px] text-white transition-colors disabled:opacity-60"
            style={{ background: "#533afd", borderRadius: 4, fontWeight: 400 }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px]" style={{ color: "#273951", fontWeight: 500 }}>
        {label}
      </label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-[13px] outline-none"
        style={{
          border: "1px solid #e5edf5",
          color: "#061b31",
          background: "#fff",
          borderRadius: 4,
        }}
        required
      />
    </div>
  );
}
