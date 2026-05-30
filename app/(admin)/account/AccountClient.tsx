"use client";

import { useState } from "react";
import { ShieldCheck, ShieldAlert, Copy, Check, AlertTriangle } from "lucide-react";

type Me = {
  id: number;
  name: string;
  email: string;
  role: "supplier" | "dispatcher" | "csr";
  mfaEnabled: boolean;
  mfaEnrolledAt: string | null;
  backupCodesRemaining: number;
};

type Phase = "idle" | "enrolling" | "confirmed" | "disabling";

export default function AccountClient({ me: initialMe }: { me: Me }) {
  const [me, setMe] = useState<Me>(initialMe);
  const [phase, setPhase] = useState<Phase>("idle");
  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [token, setToken] = useState("");
  const [disableToken, setDisableToken] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startEnroll() {
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/auth/mfa/setup", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Could not start enrollment."); return; }
      setSetup({ qrDataUrl: d.qrDataUrl, secret: d.secret });
      setPhase("enrolling");
    } finally { setBusy(false); }
  }

  async function confirmEnroll() {
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/auth/mfa/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Verification failed."); return; }
      setBackupCodes(d.backupCodes);
      setMe({ ...me, mfaEnabled: true, mfaEnrolledAt: new Date().toISOString(), backupCodesRemaining: d.backupCodes.length });
      setPhase("confirmed");
      setToken("");
    } finally { setBusy(false); }
  }

  async function disableMfa() {
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: disableToken }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Could not disable."); return; }
      setMe({ ...me, mfaEnabled: false, mfaEnrolledAt: null, backupCodesRemaining: 0 });
      setPhase("idle");
      setDisableToken("");
      setBackupCodes(null);
      setSetup(null);
    } finally { setBusy(false); }
  }

  function copyBackup() {
    if (!backupCodes) return;
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="px-4 py-5 md:px-10 md:py-8" style={{ minHeight: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="text-[26px] leading-tight" style={{ color: "#061b31", fontWeight: 300, letterSpacing: "-0.26px" }}>
          Account
        </h1>
        <p className="mt-1 text-[14px]" style={{ color: "#64748d", fontWeight: 300 }}>
          Your sign-in profile and second-factor security.
        </p>
      </div>

      {/* Profile card */}
      <Card title="Profile">
        <Row label="Name" value={me.name} />
        <Row label="Email" value={me.email} />
        <Row label="Role" value={me.role === "supplier" ? "Administrator" : me.role === "dispatcher" ? "Dispatcher" : "Customer Service"} />
      </Card>

      {/* MFA card */}
      <Card
        title="Two-factor authentication"
        right={
          me.mfaEnabled ? (
            <Pill bg="rgba(21,190,83,0.14)" color="#108c3d" icon={<ShieldCheck size={12} />}>Enabled</Pill>
          ) : (
            <Pill bg="rgba(245,158,11,0.16)" color="#9b6829" icon={<ShieldAlert size={12} />}>Not set</Pill>
          )
        }
      >
        {!me.mfaEnabled && phase === "idle" && (
          <>
            <p style={{ fontSize: 13, color: "#475569", marginBottom: 16 }}>
              Add a code from an authenticator app (Google Authenticator, 1Password, Authy, iCloud Keychain)
              to every sign-in. HIPAA §164.312(d) requires a second factor for accounts with PHI access.
            </p>
            <PrimaryButton onClick={startEnroll} disabled={busy}>
              {busy ? "Starting..." : "Enable two-factor authentication"}
            </PrimaryButton>
          </>
        )}

        {phase === "enrolling" && setup && (
          <div>
            <p style={{ fontSize: 13, color: "#475569", marginBottom: 16 }}>
              Scan the QR code with your authenticator app, then enter the 6-digit code it shows to finish.
            </p>
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 16 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qrDataUrl} alt="MFA QR" width={200} height={200} style={{ border: "1px solid #e5edf5", borderRadius: 6 }} />
              <div style={{ minWidth: 240 }}>
                <div style={{ fontSize: 11, color: "#64748d", marginBottom: 4 }}>Can't scan? Type this key:</div>
                <code style={{ display: "block", padding: "8px 10px", background: "#f6f9fc", border: "1px solid #e5edf5", borderRadius: 4, fontSize: 12, wordBreak: "break-all", fontFamily: "SourceCodePro, ui-monospace, monospace" }}>
                  {setup.secret}
                </code>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: "#64748d", marginBottom: 4 }}>
                6-digit code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={6}
                autoFocus
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter" && token.length === 6) confirmEnroll(); }}
                placeholder="123456"
                style={{ width: 160, padding: "10px 12px", fontSize: 18, letterSpacing: "0.18em", border: "1px solid #e5edf5", borderRadius: 4, outline: "none", fontFeatureSettings: '"tnum"' }}
              />
            </div>
            {err && <ErrorBanner>{err}</ErrorBanner>}
            <div style={{ display: "flex", gap: 8 }}>
              <PrimaryButton onClick={confirmEnroll} disabled={busy || token.length !== 6}>
                {busy ? "Verifying..." : "Verify and enable"}
              </PrimaryButton>
              <GhostButton onClick={() => { setPhase("idle"); setSetup(null); setToken(""); setErr(null); }}>Cancel</GhostButton>
            </div>
          </div>
        )}

        {phase === "confirmed" && backupCodes && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "#108c3d" }}>
              <ShieldCheck size={16} /> <strong style={{ fontSize: 14 }}>Two-factor enabled.</strong>
            </div>
            <p style={{ fontSize: 13, color: "#475569", marginBottom: 8 }}>
              Save these one-time backup codes somewhere safe — they're shown <strong>only once</strong> and can each be used to sign in if you lose your authenticator.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, padding: 12, background: "#f6f9fc", border: "1px solid #e5edf5", borderRadius: 6, fontFamily: "SourceCodePro, ui-monospace, monospace", fontSize: 14, fontWeight: 500, color: "#273951", marginBottom: 12, fontFeatureSettings: '"tnum"' }}>
              {backupCodes.map((c) => <div key={c}>{c}</div>)}
            </div>
            <button
              type="button"
              onClick={copyBackup}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 13, background: "#fff", border: "1px solid #e5edf5", borderRadius: 4, color: "#273951" }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy all"}
            </button>
            <div style={{ marginTop: 16 }}>
              <GhostButton onClick={() => { setPhase("idle"); setBackupCodes(null); setSetup(null); }}>Done</GhostButton>
            </div>
          </div>
        )}

        {me.mfaEnabled && phase === "idle" && (
          <div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 4 }}>
              Enrolled {me.mfaEnrolledAt ? new Date(me.mfaEnrolledAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"}.
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 16 }}>
              {me.backupCodesRemaining} backup code{me.backupCodesRemaining === 1 ? "" : "s"} remaining.
            </div>
            <GhostButton onClick={() => setPhase("disabling")}>Disable two-factor authentication</GhostButton>
          </div>
        )}

        {phase === "disabling" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, color: "#b03238" }}>
              <AlertTriangle size={14} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Confirm with a current code to disable.</span>
            </div>
            <input
              type="text" inputMode="numeric" pattern="\d*" maxLength={6} autoFocus
              value={disableToken}
              onChange={(e) => setDisableToken(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter" && disableToken.length === 6) disableMfa(); }}
              placeholder="123456"
              style={{ width: 160, padding: "10px 12px", fontSize: 18, letterSpacing: "0.18em", border: "1px solid #e5edf5", borderRadius: 4, outline: "none", fontFeatureSettings: '"tnum"', marginBottom: 12 }}
            />
            {err && <ErrorBanner>{err}</ErrorBanner>}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button" onClick={disableMfa} disabled={busy || disableToken.length !== 6}
                style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, color: "#fff", background: "#b03238", border: 0, borderRadius: 4, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}
              >
                {busy ? "Disabling..." : "Disable"}
              </button>
              <GhostButton onClick={() => { setPhase("idle"); setDisableToken(""); setErr(null); }}>Cancel</GhostButton>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5edf5", borderRadius: 6, padding: 20, marginBottom: 16, maxWidth: 720, boxShadow: "rgba(23,23,23,0.06) 0 3px 6px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 500, color: "#061b31" }}>{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f6f9fc", fontSize: 13 }}>
      <span style={{ color: "#64748d" }}>{label}</span>
      <span style={{ color: "#273951", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Pill({ bg, color, icon, children }: { bg: string; color: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", fontSize: 11, fontWeight: 500, background: bg, color, borderRadius: 4 }}>
      {icon} {children}
    </span>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      style={{ padding: "8px 16px", fontSize: 13, fontWeight: 500, color: "#fff", background: "#533afd", border: 0, borderRadius: 4, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, color: "#273951", background: "#fff", border: "1px solid #e5edf5", borderRadius: 4, cursor: "pointer" }}
    >
      {children}
    </button>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "8px 12px", fontSize: 12, color: "#b03238", background: "rgba(229,72,77,0.08)", border: "1px solid rgba(229,72,77,0.25)", borderRadius: 4, marginBottom: 12 }}>
      {children}
    </div>
  );
}
