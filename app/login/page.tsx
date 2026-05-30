"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

const DEMO_ACCOUNTS = [
  { label: "Stee Suite (Admin)", email: "stee@equipdispatch.com",    password: "Admin123!",  role: "supplier"   },
  { label: "Melissa (CSR)",      email: "melissa@equipdispatch.com", password: "Equip2026!", role: "csr"        },
  { label: "Nic (Dispatcher)",   email: "nic@equipdispatch.com",     password: "Equip2026!", role: "dispatcher" },
  { label: "Gabe (CSR + Disp)",  email: "gabe@equipdispatch.com",    password: "Equip2026!", role: "csr"        },
];

// Login is a two-step machine: collect password → if server says
// mfaRequired, collect TOTP/backup. A tagged union per step keeps the
// password fields, mfa-code fields, and mode toggle (totp vs backup) in
// exactly one place; the inputs they imply can't exist without their step.
type Step =
  | { kind: "password"; email: string; password: string }
  | { kind: "mfa"; email: string; mode: "totp" | "backup"; token: string; backup: string };

export default function LoginPage() {
  const [step, setStep] = useState<Step>({ kind: "password", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "password") return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: step.email, password: step.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        setLoading(false);
        return;
      }
      // MFA path: server set a short-lived challenge cookie instead of a
      // session. Swap state to the mfa step; don't bounce to /tracker yet.
      if (data.mfaRequired) {
        setStep({ kind: "mfa", email: step.email, mode: "totp", token: "", backup: "" });
        setLoading(false);
        return;
      }
      const sessionCheck = await fetch("/api/me", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!sessionCheck.ok) {
        setError("Login worked, but the session did not stick. Please try once more.");
        setLoading(false);
        return;
      }
      window.location.assign("/tracker");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "mfa") return;
    setError("");
    setLoading(true);
    try {
      const body = step.mode === "backup" ? { backupCode: step.backup } : { token: step.token };
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Verification failed");
        setLoading(false);
        return;
      }
      window.location.assign("/tracker");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  function fillDemo(acc: typeof DEMO_ACCOUNTS[0]) {
    setStep({ kind: "password", email: acc.email, password: acc.password });
    setError("");
  }

  function toggleMfaMode() {
    if (step.kind !== "mfa") return;
    setStep({ ...step, mode: step.mode === "totp" ? "backup" : "totp" });
    setError("");
  }

  function cancelMfa() {
    if (step.kind !== "mfa") return;
    // Preserve the email so the user doesn't have to retype it on retry.
    setStep({ kind: "password", email: step.email, password: "" });
    setError("");
  }

  const onMfaStep = step.kind === "mfa";
  const mfaMode = step.kind === "mfa" ? step.mode : "totp";

  return (
    <div
      className="min-h-screen flex"
      style={{
        fontFamily: "Inter, sohne-var, -apple-system, system-ui, sans-serif",
        fontFeatureSettings: '"ss01"',
        background: "#f6f9fc",
        color: "#061b31",
      }}
    >
      {/* Left panel — brand-dark immersive section */}
      <div
        className="hidden lg:flex flex-col justify-between w-[26rem] flex-shrink-0 p-10"
        style={{ background: "#1c1e54", color: "#ffffff" }}
      >
        <div>
          <div className="mb-12 flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center text-[13px] text-white"
              style={{ background: "#533afd", borderRadius: 4, fontWeight: 500 }}
            >
              ED
            </div>
            <div>
              <div className="text-[15px] leading-tight" style={{ fontWeight: 500 }}>EquipDispatch</div>
              <div className="text-[12px]" style={{ color: "#b9b9f9" }}>Equipment support for nursing facilities</div>
            </div>
          </div>

          <h2
            className="leading-tight"
            style={{ fontSize: 32, fontWeight: 300, letterSpacing: "-0.64px", color: "#ffffff" }}
          >
            A calmer, simpler way to manage delivery requests.
          </h2>
          <p
            className="mt-4"
            style={{ fontSize: 14, lineHeight: "22px", color: "#d6d9fc", fontWeight: 300 }}
          >
            Built for staff who need clear screens, larger text, and fast actions without digging through busy menus.
          </p>

          <div className="mt-10 space-y-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 flex-shrink-0" size={18} style={{ color: "#15be53" }} />
              <div>
                <div className="text-[13px]" style={{ fontWeight: 500 }}>HIPAA-conscious access</div>
                <div className="mt-0.5 text-[12px]" style={{ color: "#d6d9fc" }}>
                  Encrypted sessions, audit logging, and role-based access control.
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div
                className="mt-1 h-2 w-2 flex-shrink-0"
                style={{ background: "#15be53", borderRadius: 4 }}
              />
              <div>
                <div className="text-[13px]" style={{ fontWeight: 500 }}>35 Michigan facilities</div>
                <div className="mt-0.5 text-[12px]" style={{ color: "#d6d9fc" }}>
                  Real-time order tracking across all partner nursing homes.
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="text-[11px]" style={{ color: "#b9b9f9" }}>
          &copy; {new Date().getFullYear()} EquipDispatch. All rights reserved.
        </div>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-[440px]">
          {/* Mobile brand */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div
              className="flex h-9 w-9 items-center justify-center text-[13px] text-white"
              style={{ background: "#533afd", borderRadius: 4, fontWeight: 500 }}
            >
              ED
            </div>
            <div>
              <div className="text-[15px]" style={{ color: "#061b31", fontWeight: 500 }}>EquipDispatch</div>
              <div className="text-[12px]" style={{ color: "#64748d" }}>Equipment support for nursing facilities</div>
            </div>
          </div>

          <div
            className="p-8"
            style={{
              background: "#ffffff",
              border: "1px solid #e5edf5",
              borderRadius: 8,
              boxShadow: "rgba(50,50,93,0.08) 0px 15px 35px, rgba(0,0,0,0.06) 0px 5px 15px",
            }}
          >
            <h1
              className="mb-1.5"
              style={{
                color: "#061b31",
                fontSize: 26,
                fontWeight: 300,
                letterSpacing: "-0.32px",
              }}
            >
              {onMfaStep ? "Two-factor code" : "Welcome back"}
            </h1>
            <p className="mb-6 text-[13px]" style={{ color: "#64748d", lineHeight: "20px" }}>
              {onMfaStep
                ? (mfaMode === "backup"
                    ? "Enter one of your one-time backup codes."
                    : "Enter the 6-digit code from your authenticator app.")
                : "Sign in to review equipment requests, dispatch deliveries, and confirm completion."}
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

            {step.kind === "password" && (
              <form onSubmit={handlePasswordSubmit} className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-[12px]" style={{ color: "#273951", fontWeight: 500 }}>
                    Email address
                  </label>
                  <input
                    type="email"
                    value={step.email}
                    onChange={(e) => setStep({ ...step, email: e.target.value })}
                    required
                    placeholder="name@facility.org"
                    className="w-full px-3 py-2 text-[13px] outline-none"
                    style={{
                      border: "1px solid #e5edf5",
                      color: "#061b31",
                      background: "#ffffff",
                      borderRadius: 4,
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#533afd")}
                    onBlur={(e) => (e.target.style.borderColor = "#e5edf5")}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px]" style={{ color: "#273951", fontWeight: 500 }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={step.password}
                    onChange={(e) => setStep({ ...step, password: e.target.value })}
                    required
                    placeholder="••••••••"
                    className="w-full px-3 py-2 text-[13px] outline-none"
                    style={{
                      border: "1px solid #e5edf5",
                      color: "#061b31",
                      background: "#ffffff",
                      borderRadius: 4,
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#533afd")}
                    onBlur={(e) => (e.target.style.borderColor = "#e5edf5")}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 py-2 text-[13px] text-white transition-colors disabled:opacity-60"
                  style={{
                    background: "#533afd",
                    borderRadius: 4,
                    fontWeight: 400,
                  }}
                  onMouseEnter={(e) => !loading && ((e.target as HTMLButtonElement).style.background = "#4434d4")}
                  onMouseLeave={(e) => !loading && ((e.target as HTMLButtonElement).style.background = "#533afd")}
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>
            )}

            {step.kind === "mfa" && (
              <form onSubmit={handleMfaSubmit} className="space-y-3">
                {step.mode === "backup" ? (
                  <div>
                    <label className="mb-1.5 block text-[12px]" style={{ color: "#273951", fontWeight: 500 }}>
                      Backup code
                    </label>
                    <input
                      type="text"
                      autoFocus
                      value={step.backup}
                      onChange={(e) => setStep({ ...step, backup: e.target.value.toUpperCase() })}
                      required
                      placeholder="XXXX-XXXX"
                      className="w-full px-3 py-2 text-[14px] outline-none"
                      style={{
                        border: "1px solid #e5edf5", color: "#061b31",
                        background: "#ffffff", borderRadius: 4,
                        fontFamily: "SourceCodePro, ui-monospace, monospace",
                        letterSpacing: "0.08em",
                        fontFeatureSettings: '"tnum"',
                      }}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="mb-1.5 block text-[12px]" style={{ color: "#273951", fontWeight: 500 }}>
                      Authenticator code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
                      maxLength={6}
                      autoFocus
                      value={step.token}
                      onChange={(e) => setStep({ ...step, token: e.target.value.replace(/\D/g, "") })}
                      required
                      placeholder="123456"
                      className="w-full px-3 py-2 text-[18px] outline-none"
                      style={{
                        border: "1px solid #e5edf5", color: "#061b31",
                        background: "#ffffff", borderRadius: 4,
                        letterSpacing: "0.18em", fontFeatureSettings: '"tnum"',
                      }}
                    />
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading || (step.mode === "backup" ? step.backup.length < 8 : step.token.length !== 6)}
                  className="flex w-full items-center justify-center gap-2 py-2 text-[13px] text-white transition-colors disabled:opacity-60"
                  style={{ background: "#533afd", borderRadius: 4, fontWeight: 400 }}
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                  {loading ? "Verifying…" : "Verify"}
                </button>
                <div className="flex items-center justify-between pt-1 text-[12px]">
                  <button
                    type="button"
                    onClick={toggleMfaMode}
                    style={{ color: "#533afd", background: "transparent", border: 0, cursor: "pointer", padding: 0 }}
                  >
                    {step.mode === "backup" ? "Use authenticator code instead" : "Use a backup code instead"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelMfa}
                    style={{ color: "#64748d", background: "transparent", border: 0, cursor: "pointer", padding: 0 }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Demo accounts — only on the password step. */}
            {step.kind === "password" && (
              <div className="mt-6 pt-5" style={{ borderTop: "1px solid #e5edf5" }}>
                <div
                  className="mb-2.5 text-[10px] uppercase"
                  style={{ color: "#64748d", letterSpacing: "0.08em", fontWeight: 500 }}
                >
                  Demo accounts
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      onClick={() => fillDemo(acc)}
                      className="px-3 py-2 text-left text-[12px] transition-colors"
                      style={{
                        background: "#ffffff",
                        border: "1px solid #e5edf5",
                        borderRadius: 4,
                        color: "#273951",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "#f6f9fc";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "#d6d9fc";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "#ffffff";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5edf5";
                      }}
                    >
                      <div className="text-[13px]" style={{ color: "#061b31", fontWeight: 500 }}>{acc.label}</div>
                      <div className="mt-0.5 truncate text-[11px]" style={{ color: "#64748d" }}>{acc.email}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
