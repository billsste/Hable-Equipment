import { equipStore, type UserRole } from "./equip-store";

// One callsite for the audit envelope. Captures the IP from the request once
// (so every audit entry gets it uniformly per HIPAA §164.312(b) "source"),
// fills the timestamp + actor identity, and forwards to equipStore. Routes
// just say what happened, not how to log it.
export async function logAudit(
  request: Request,
  user: { id: number; name: string; role: UserRole },
  entry: { action: string; detail: string; ref?: string; patient?: string },
): Promise<void> {
  const ip =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown";
  await equipStore.addAuditEntry({
    ts: new Date().toISOString(),
    who: user.name,
    role: user.role,
    action: entry.action,
    // Tag every detail with the source IP so forensics has the same context
    // regardless of which route wrote the entry.
    detail: ip === "unknown" ? entry.detail : `${entry.detail} (ip ${ip})`,
    ref: entry.ref ?? `USR-${user.id}`,
    patient: entry.patient ?? "",
  });
}
