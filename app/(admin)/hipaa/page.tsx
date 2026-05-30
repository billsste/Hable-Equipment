"use client";

import { useState } from "react";
import { ShieldCheck, Download, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

type ComplianceStatus = "implemented" | "partial" | "not_yet";

type ComplianceItem = {
  id: string;
  requirement: string;
  ref: string;
  status: ComplianceStatus;
  detail: string;
  configNote: string;
};

type ComplianceGroup = {
  title: string;
  items: ComplianceItem[];
};

const COMPLIANCE_GROUPS: ComplianceGroup[] = [
  {
    title: "Access Controls",
    items: [
      {
        id: "ac-1",
        requirement: "Role-Based Access Control (RBAC)",
        ref: "§164.312(a)(1)",
        status: "implemented",
        detail: "Three-tier RBAC: Supplier (full admin), CSR (intake & verification), Dispatcher (assign, deliver, mark outcome). All API routes enforce role checks.",
        configNote: "Enforced in all /api/* routes via getSessionUser() + role checks. Sidebar nav also filters by role.",
      },
      {
        id: "ac-2",
        requirement: "Unique User Identification",
        ref: "§164.312(a)(2)(i)",
        status: "implemented",
        detail: "Each user has a unique ID, email, and password. No shared accounts permitted.",
        configNote: "User IDs are auto-incremented. Email is used as unique login identifier.",
      },
      {
        id: "ac-3",
        requirement: "Automatic Logoff",
        ref: "§164.312(a)(2)(iii)",
        status: "implemented",
        detail: "Sessions expire after 15 minutes — aligned with NIST SP 800-66 / CMS guidance and healthcare industry practice for inactivity timeout.",
        configNote: "SESSION_TTL_MS = 15 * 60 * 1000 in lib/auth.ts",
      },
    ],
  },
  {
    title: "Audit Controls",
    items: [
      {
        id: "aud-1",
        requirement: "System Activity Audit Logs",
        ref: "§164.312(b)",
        status: "implemented",
        detail: "Login/logout, order creation, status changes, dispatcher assignments, and user management actions are recorded with timestamp, user, role, action, detail, and reference.",
        configNote: "equipStore.addAuditEntry() called in all mutation API routes; viewable at /audit-log (Admin only).",
      },
      {
        id: "aud-2",
        requirement: "Per-Record Activity Log",
        ref: "§164.312(b)",
        status: "implemented",
        detail: "Each order keeps a per-record OrderEvent history of every field-level edit (who, when, before → after) so any change to PHI is traceable.",
        configNote: "OrderEvent rows are written by /api/tracker/orders/[id] PATCH on every diffed field.",
      },
    ],
  },
  {
    title: "Transmission Security",
    items: [
      {
        id: "ts-1",
        requirement: "Encryption in Transit (TLS)",
        ref: "§164.312(e)(1)",
        status: "partial",
        detail: "Application is built to run behind a TLS-terminating reverse proxy (nginx/Caddy). Cookie flags set to Secure.",
        configNote: "Deploy behind nginx with TLS 1.3. Ensure HTTPS is enforced at the load balancer.",
      },
      {
        id: "ts-2",
        requirement: "Secure Session Cookies",
        ref: "§164.312(e)(1)",
        status: "implemented",
        detail: "Session cookie is HttpOnly, Secure, SameSite=Strict to prevent XSS and CSRF attacks.",
        configNote: "Cookie flags set in /api/auth/login/route.ts response headers.",
      },
    ],
  },
  {
    title: "Data Protection",
    items: [
      {
        id: "dp-1",
        requirement: "PHI Minimum Necessary",
        ref: "§164.514(d)",
        status: "implemented",
        detail: "External order form includes PHI consent notice. Only necessary patient data (name, room) is collected for equipment dispatch.",
        configNote: "PHI notice displayed on /order page before submission.",
      },
      {
        id: "dp-2",
        requirement: "Encryption at Rest",
        ref: "§164.312(a)(2)(iv)",
        status: "partial",
        detail: "Data persists to PostgreSQL via Prisma. Production deployment must run on a managed Postgres with disk-level AES-256 encryption (AWS RDS, DigitalOcean Managed DB, etc.).",
        configNote: "Enable encryption-at-rest at the database tier; this app does not duplicate it at the column level.",
      },
      {
        id: "dp-3",
        requirement: "Backup & Disaster Recovery",
        ref: "§164.310(d)(2)(ii)",
        status: "not_yet",
        detail: "Point-in-time recovery (PITR) backups must be configured at the database tier before production PHI handling.",
        configNote: "Enable PITR + automated daily snapshots on the managed Postgres instance; document restore procedure.",
      },
    ],
  },
  {
    title: "Authentication",
    items: [
      {
        id: "auth-1",
        requirement: "Password Complexity Requirements",
        ref: "§164.312(a)(2)(i)",
        status: "implemented",
        detail: "Passwords require minimum 8 characters, uppercase, lowercase, and a number. Validated on user creation.",
        configNote: "validatePassword() in lib/auth.ts enforced in /api/users POST.",
      },
      {
        id: "auth-2",
        requirement: "Login Attempt Lockout",
        ref: "§164.312(d)",
        status: "implemented",
        detail: "Accounts are locked for 15 minutes after 5 consecutive failed login attempts.",
        configNote: "MAX_ATTEMPTS=5, LOCKOUT_MS=15*60*1000 in lib/auth.ts",
      },
      {
        id: "auth-3",
        requirement: "Multi-Factor Authentication (MFA)",
        ref: "§164.312(d)",
        status: "implemented",
        detail: "TOTP (RFC 6238) MFA — Google Authenticator / 1Password / Authy compatible. Each user can enroll from the Account page; backup codes generated at enrollment (hashed at rest). Disabling MFA requires a fresh code, so a stolen session cannot remove the second factor.",
        configNote: "Self-serve at /account; verified at login by /api/auth/mfa/verify. TOTP & backup-code logic in lib/mfa.ts (10 unit tests).",
      },
    ],
  },
  {
    title: "Administrative Safeguards",
    items: [
      {
        id: "as-1",
        requirement: "Workforce Training Documentation",
        ref: "§164.308(a)(5)",
        status: "partial",
        detail: "HIPAA compliance dashboard documents controls. Staff training records should be maintained separately.",
        configNote: "Supplement with annual HIPAA training records for all staff with PHI access.",
      },
      {
        id: "as-2",
        requirement: "Business Associate Agreements (BAA)",
        ref: "§164.308(b)(1)",
        status: "partial",
        detail: "PHI notice on external order form acknowledges BAA coverage. Formal BAA documents required per facility.",
        configNote: "Execute a signed BAA with each partner facility before production use.",
      },
      {
        id: "as-3",
        requirement: "Incident Response Plan",
        ref: "§164.308(a)(6)",
        status: "not_yet",
        detail: "No formal incident response or breach notification procedure is documented.",
        configNote: "Develop and document incident response plan including 60-day breach notification procedure.",
      },
    ],
  },
  {
    title: "Physical Safeguards",
    items: [
      {
        id: "ps-1",
        requirement: "Workstation Use Policy",
        ref: "§164.310(b)",
        status: "partial",
        detail: "Auto-logoff after 15 min of inactivity reduces risk of unauthorized workstation access. No formal written policy.",
        configNote: "Document workstation use policy. Recommend screen lock enforcement via OS policy.",
      },
      {
        id: "ps-2",
        requirement: "Device & Media Controls",
        ref: "§164.310(d)(1)",
        status: "not_yet",
        detail: "No formal device inventory or media disposal procedure documented.",
        configNote: "Implement device inventory tracking and documented media disposal (degaussing/shredding).",
      },
    ],
  },
];

const STATUS_CONFIG: Record<ComplianceStatus, { icon: React.ReactNode; label: string; bg: string; color: string }> = {
  implemented: {
    icon: <CheckCircle2 size={16} style={{ color: "#16a34a" }} />,
    label: "Implemented",
    bg: "#f0fdf4",
    color: "#16a34a",
  },
  partial: {
    icon: <AlertTriangle size={16} style={{ color: "#d97706" }} />,
    label: "Partial",
    bg: "#fffbeb",
    color: "#d97706",
  },
  not_yet: {
    icon: <XCircle size={16} style={{ color: "#dc2626" }} />,
    label: "Not Yet",
    bg: "#fef2f2",
    color: "#dc2626",
  },
};

export default function HipaaPage() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const allItems = COMPLIANCE_GROUPS.flatMap((g) => g.items);
  const implemented = allItems.filter((i) => i.status === "implemented").length;
  const partial = allItems.filter((i) => i.status === "partial").length;
  const notYet = allItems.filter((i) => i.status === "not_yet").length;
  const score = Math.round((implemented + partial * 0.5) / allItems.length * 100);

  function exportReport() {
    const lines: string[] = [
      "EQUIPDISPATCH HIPAA COMPLIANCE REPORT",
      `Generated: ${new Date().toLocaleString()}`,
      `Overall Score: ${score}%`,
      `Implemented: ${implemented} | Partial: ${partial} | Not Yet: ${notYet}`,
      "",
      "=" .repeat(60),
      "",
    ];
    for (const group of COMPLIANCE_GROUPS) {
      lines.push(`## ${group.title}`);
      for (const item of group.items) {
        const status = STATUS_CONFIG[item.status];
        lines.push(`  [${status.label.toUpperCase()}] ${item.requirement} (${item.ref})`);
        lines.push(`    ${item.detail}`);
        lines.push(`    Config: ${item.configNote}`);
        lines.push("");
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hipaa-compliance-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: "#1a1d26" }}>
            <ShieldCheck size={20} style={{ color: "#16a34a" }} /> HIPAA Compliance
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "#5a6070" }}>
            Security & compliance status for EquipDispatch
          </p>
        </div>
        <button
          onClick={exportReport}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg"
          style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}
        >
          <Download size={14} /> Export Report
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
          <div className="text-3xl font-bold mb-1" style={{ color: score >= 80 ? "#16a34a" : score >= 60 ? "#d97706" : "#dc2626" }}>
            {score}%
          </div>
          <div className="text-xs" style={{ color: "#8c92a4" }}>Compliance Score</div>
          <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: "#f3f4f6" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${score}%`,
                background: score >= 80 ? "#16a34a" : score >= 60 ? "#d97706" : "#dc2626",
              }}
            />
          </div>
        </div>
        <div className="bg-white rounded-xl p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
          <div className="text-3xl font-bold mb-1" style={{ color: "#16a34a" }}>{implemented}</div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={14} style={{ color: "#16a34a" }} />
            <span className="text-xs" style={{ color: "#8c92a4" }}>Implemented</span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
          <div className="text-3xl font-bold mb-1" style={{ color: "#d97706" }}>{partial}</div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={14} style={{ color: "#d97706" }} />
            <span className="text-xs" style={{ color: "#8c92a4" }}>Partial</span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
          <div className="text-3xl font-bold mb-1" style={{ color: "#dc2626" }}>{notYet}</div>
          <div className="flex items-center gap-1.5">
            <XCircle size={14} style={{ color: "#dc2626" }} />
            <span className="text-xs" style={{ color: "#8c92a4" }}>Not Yet</span>
          </div>
        </div>
      </div>

      {/* Checklist groups */}
      <div className="space-y-4">
        {COMPLIANCE_GROUPS.map((group) => (
          <div key={group.title} className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
            <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #eef0f3", background: "#f8f9fb" }}>
              <h3 className="text-sm font-semibold" style={{ color: "#1a1d26" }}>{group.title}</h3>
            </div>
            <div className="divide-y" style={{ borderColor: "#eef0f3" }}>
              {group.items.map((item) => {
                const sc = STATUS_CONFIG[item.status];
                const isExpanded = expanded === item.id;
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => setExpanded(isExpanded ? null : item.id)}
                      className="w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-[#f8f9fb]"
                    >
                      <span className="flex-shrink-0">{sc.icon}</span>
                      <span className="flex-1 text-sm font-medium" style={{ color: "#1a1d26" }}>
                        {item.requirement}
                      </span>
                      <span className="text-xs font-mono" style={{ color: "#8c92a4" }}>{item.ref}</span>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: sc.bg, color: sc.color }}
                      >
                        {sc.label}
                      </span>
                      {isExpanded ? (
                        <ChevronUp size={14} style={{ color: "#8c92a4" }} />
                      ) : (
                        <ChevronDown size={14} style={{ color: "#8c92a4" }} />
                      )}
                    </button>
                    {isExpanded && (
                      <div className="px-5 pb-4 pt-0" style={{ background: "#f8f9fb", borderTop: "1px solid #eef0f3" }}>
                        <p className="text-sm mt-3 mb-2" style={{ color: "#5a6070" }}>{item.detail}</p>
                        <div
                          className="flex items-start gap-2 px-3 py-2.5 rounded-lg"
                          style={{ background: "#eff4ff", border: "1px solid #bfdbfe" }}
                        >
                          <span className="text-xs font-semibold flex-shrink-0 mt-0.5" style={{ color: "#2563eb" }}>Config:</span>
                          <span className="text-xs" style={{ color: "#1d4ed8" }}>{item.configNote}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
