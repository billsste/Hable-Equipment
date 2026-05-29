"use client";

import { useMemo, useState } from "react";
import { Download, Loader2, Pencil, Plus, RotateCcw, Trash2, Users, X } from "lucide-react";
import { downloadCsv } from "@/lib/utils";

type UserRole = "supplier" | "dispatcher" | "csr";
export type SafeUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  roles: string[];
  active: boolean;
};

const ALL_ROLES: UserRole[] = ["csr", "dispatcher", "supplier"];

const ROLE_LABELS: Record<UserRole, string> = {
  supplier:   "Admin",
  csr:        "CSR",
  dispatcher: "Dispatcher",
};

const ROLE_COLORS: Record<UserRole, { bg: string; color: string }> = {
  supplier:   { bg: "rgba(83,58,253,0.10)",  color: "#4434d4" },
  csr:        { bg: "rgba(40,116,173,0.14)", color: "#2874ad" },
  dispatcher: { bg: "rgba(155,104,41,0.14)", color: "#9b6829" },
};

export default function UsersClient({
  initialUsers,
  me,
}: {
  initialUsers: SafeUser[];
  me: { id: number; role: string };
}) {
  const [users, setUsers] = useState<SafeUser[]>(initialUsers);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<SafeUser | null>(null);
  const [deactivateUser, setDeactivateUser] = useState<SafeUser | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const visibleUsers = useMemo(
    () => (showInactive ? users : users.filter((u) => u.active)),
    [users, showInactive],
  );
  const inactiveCount = users.filter((u) => !u.active).length;

  async function reload() {
    const res = await fetch("/api/users");
    const d = await res.json();
    setUsers(d.users ?? []);
  }

  async function handleDeactivate(user: SafeUser) {
    await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    setDeactivateUser(null);
    await reload();
  }

  async function handleReactivate(user: SafeUser) {
    await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    await reload();
  }

  function handleExport() {
    const rows: string[][] = [
      ["ID", "Name", "Email", "Role", "Status"],
      ...users.map((u) => [
        String(u.id), u.name, u.email,
        ROLE_LABELS[u.role] ?? u.role,
        u.active ? "Active" : "Inactive",
      ]),
    ];
    downloadCsv(`users-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  const canModify = (user: SafeUser) => user.id !== me.id && me.role === "supplier";

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className="flex items-center gap-2"
            style={{ color: "#061b31", fontSize: 22, fontWeight: 300, letterSpacing: "-0.22px" }}
          >
            <Users size={18} /> Users
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "#64748d" }}>
            {visibleUsers.length} {showInactive ? "total" : "active"} user{visibleUsers.length === 1 ? "" : "s"}
            {!showInactive && inactiveCount > 0 ? ` · ${inactiveCount} hidden inactive` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inactiveCount > 0 && (
            <label className="flex items-center gap-1.5 text-[12px]" style={{ color: "#64748d" }}>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show inactive
            </label>
          )}
          <button
            type="button"
            onClick={handleExport}
            disabled={users.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] disabled:opacity-50"
            style={{
              background: "#ffffff",
              border: "1px solid #e5edf5",
              color: "#273951",
              borderRadius: 4,
              fontWeight: 400,
            }}
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-white"
            style={{ background: "#533afd", borderRadius: 4, fontWeight: 400 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#4434d4")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#533afd")}
          >
            <Plus size={14} /> Add User
          </button>
        </div>
      </div>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5edf5",
          borderRadius: 6,
          boxShadow: "rgba(23,23,23,0.06) 0px 3px 6px",
          overflow: "hidden",
        }}
      >
        <table className="w-full">
          <thead style={{ background: "#f6f9fc" }}>
            <tr style={{ borderBottom: "1px solid #e5edf5" }}>
              {["User", "Email", "Role", "Actions"].map((h) => (
                <th
                  key={h}
                  className="px-5 py-2.5 text-left text-[11px] uppercase"
                  style={{ color: "#64748d", letterSpacing: "0.05em", fontWeight: 500 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((user) => {
              const rc = ROLE_COLORS[user.role] ?? ROLE_COLORS.csr;
              const initials = user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
              const dimmed = !user.active;
              return (
                <tr
                  key={user.id}
                  style={{
                    borderBottom: "1px solid #e5edf5",
                    background: dimmed ? "#f6f9fc" : undefined,
                    opacity: dimmed ? 0.7 : 1,
                  }}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 flex items-center justify-center text-[11px] text-white flex-shrink-0"
                        style={{
                          background: dimmed ? "#94a3b8" : "#533afd",
                          borderRadius: 4,
                          fontWeight: 500,
                        }}
                      >
                        {initials}
                      </div>
                      <span className="text-[13px]" style={{ color: "#061b31", fontWeight: 500 }}>
                        {user.name}
                      </span>
                      {user.id === me.id && (
                        <span
                          className="text-[11px] px-1.5 py-0.5"
                          style={{
                            background: "rgba(83,58,253,0.10)",
                            color: "#4434d4",
                            borderRadius: 4,
                            border: "1px solid rgba(83,58,253,0.30)",
                          }}
                        >
                          You
                        </span>
                      )}
                      {dimmed && (
                        <span
                          className="text-[11px] px-1.5 py-0.5"
                          style={{
                            background: "rgba(100,116,141,0.14)",
                            color: "#64748d",
                            borderRadius: 4,
                            border: "1px solid rgba(100,116,141,0.30)",
                          }}
                        >
                          Inactive
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[13px]" style={{ color: "#64748d" }}>{user.email}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <span
                        className="text-[11px] px-1.5 py-0.5"
                        style={{
                          background: rc.bg,
                          color: rc.color,
                          borderRadius: 4,
                          border: `1px solid ${rc.color}33`,
                          fontWeight: 400,
                        }}
                      >
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                      {(user.roles ?? [])
                        .filter((r): r is UserRole => r !== user.role && (ALL_ROLES as string[]).includes(r))
                        .map((r) => {
                          const c = ROLE_COLORS[r];
                          return (
                            <span
                              key={r}
                              className="text-[10px] px-1 py-0.5"
                              style={{
                                background: c.bg,
                                color: c.color,
                                borderRadius: 3,
                                border: `1px solid ${c.color}22`,
                                fontWeight: 400,
                              }}
                            >
                              + {ROLE_LABELS[r]}
                            </span>
                          );
                        })}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {!canModify(user) ? (
                      <span className="text-[12px]" style={{ color: "#94a3b8" }}>
                        {user.id === me.id ? "Current" : "—"}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setEditUser(user)}
                          className="flex items-center gap-1.5 text-[12px] px-2 py-1"
                          style={{
                            background: "#ffffff",
                            color: "#273951",
                            border: "1px solid #e5edf5",
                            borderRadius: 4,
                            fontWeight: 400,
                          }}
                        >
                          <Pencil size={12} /> Edit
                        </button>
                        {user.active ? (
                          <button
                            onClick={() => setDeactivateUser(user)}
                            className="flex items-center gap-1.5 text-[12px] px-2 py-1"
                            style={{
                              background: "rgba(229,72,77,0.10)",
                              color: "#b03238",
                              border: "1px solid rgba(229,72,77,0.30)",
                              borderRadius: 4,
                              fontWeight: 400,
                            }}
                          >
                            <Trash2 size={12} /> Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(user)}
                            className="flex items-center gap-1.5 text-[12px] px-2 py-1"
                            style={{
                              background: "rgba(21,190,83,0.12)",
                              color: "#108c3d",
                              border: "1px solid rgba(21,190,83,0.30)",
                              borderRadius: 4,
                              fontWeight: 400,
                            }}
                          >
                            <RotateCcw size={12} /> Reactivate
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={async () => { await reload(); setShowAdd(false); }}
        />
      )}

      {editUser && (
        <EditUserModal
          user={editUser}
          isSelf={editUser.id === me.id}
          onClose={() => setEditUser(null)}
          onSaved={async () => { await reload(); setEditUser(null); }}
        />
      )}

      {deactivateUser && (
        <ConfirmModal
          title="Deactivate User"
          message={`Deactivate ${deactivateUser.name} (${deactivateUser.email})? They'll be signed out and removed from CSR/Dispatcher dropdowns. Historical orders stay intact and you can reactivate later.`}
          onConfirm={() => handleDeactivate(deactivateUser)}
          onCancel={() => setDeactivateUser(null)}
        />
      )}
    </div>
  );
}

function validatePw(pw: string): string[] {
  const e: string[] = [];
  if (pw.length < 8) e.push("At least 8 characters");
  if (!/[A-Z]/.test(pw)) e.push("One uppercase letter");
  if (!/[a-z]/.test(pw)) e.push("One lowercase letter");
  if (!/[0-9]/.test(pw)) e.push("One number");
  return e;
}

function AddUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("csr");
  const [extraRoles, setExtraRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function toggleExtraRole(r: UserRole) {
    setExtraRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pwErrors = validatePw(password);
    if (pwErrors.length) { setErrors(pwErrors); return; }
    setErrors([]);
    setLoading(true);
    const roles = Array.from(new Set([role, ...extraRoles]));
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role, roles }),
    });
    const d = await res.json();
    if (!res.ok) {
      setErrors([d.error ?? "Failed to create user"]);
      setLoading(false);
      return;
    }
    setLoading(false);
    onCreated();
  }

  const pwStrength = validatePw(password);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(6,27,49,0.4)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md p-6"
        style={{
          background: "#ffffff",
          borderRadius: 8,
          boxShadow:
            "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.10) 0px 18px 36px -18px",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ color: "#061b31", fontSize: 18, fontWeight: 500 }}>Add User</h2>
          <button onClick={onClose}><X size={16} style={{ color: "#64748d" }} /></button>
        </div>
        {errors.length > 0 && (
          <div
            className="mb-4 px-3 py-2"
            style={{
              background: "rgba(229,72,77,0.08)",
              border: "1px solid rgba(229,72,77,0.30)",
              borderRadius: 4,
            }}
          >
            {errors.map((e, i) => (
              <div key={i} className="text-[12px]" style={{ color: "#b03238" }}>&bull; {e}</div>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[12px] mb-1.5" style={{ color: "#273951", fontWeight: 500 }}>Full Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full px-3 py-2 text-[13px] outline-none"
              style={{ border: "1px solid #e5edf5", borderRadius: 4, color: "#061b31" }}
              onFocus={(e) => (e.target.style.borderColor = "#533afd")}
              onBlur={(e) => (e.target.style.borderColor = "#e5edf5")} />
          </div>
          <div>
            <label className="block text-[12px] mb-1.5" style={{ color: "#273951", fontWeight: 500 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-3 py-2 text-[13px] outline-none"
              style={{ border: "1px solid #e5edf5", borderRadius: 4, color: "#061b31" }}
              onFocus={(e) => (e.target.style.borderColor = "#533afd")}
              onBlur={(e) => (e.target.style.borderColor = "#e5edf5")} />
          </div>
          <div>
            <label className="block text-[12px] mb-1.5" style={{ color: "#273951", fontWeight: 500 }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full px-3 py-2 text-[13px] outline-none"
              style={{ border: "1px solid #e5edf5", borderRadius: 4, color: "#061b31" }}
              onFocus={(e) => (e.target.style.borderColor = "#533afd")}
              onBlur={(e) => (e.target.style.borderColor = "#e5edf5")} />
            {password && (
              <div className="mt-2 space-y-0.5">
                {[
                  { label: "8+ characters", ok: password.length >= 8 },
                  { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
                  { label: "Lowercase letter", ok: /[a-z]/.test(password) },
                  { label: "Number", ok: /[0-9]/.test(password) },
                ].map((r) => (
                  <div key={r.label} className="flex items-center gap-1.5 text-[11px]">
                    <div
                      className="w-2 h-2 flex-shrink-0"
                      style={{ background: r.ok ? "#15be53" : "#e5edf5", borderRadius: 4 }}
                    />
                    <span style={{ color: r.ok ? "#108c3d" : "#94a3b8" }}>{r.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-[12px] mb-1.5" style={{ color: "#273951", fontWeight: 500 }}>Primary Role</label>
            <select value={role} onChange={(e) => {
                const newRole = e.target.value as UserRole;
                setRole(newRole);
                setExtraRoles((prev) => prev.filter((r) => r !== newRole));
              }}
              className="w-full px-3 py-2 text-[13px] outline-none"
              style={{ border: "1px solid #e5edf5", borderRadius: 4, color: "#061b31", background: "#ffffff" }}>
              <option value="csr">CSR (Customer Service Rep)</option>
              <option value="dispatcher">Dispatcher</option>
              <option value="supplier">Admin (Full Access)</option>
            </select>
          </div>
          <div>
            <label className="block text-[12px] mb-1.5" style={{ color: "#273951", fontWeight: 500 }}>
              Additional Roles <span style={{ color: "#64748d", fontWeight: 400 }}>(optional)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(["csr", "dispatcher", "supplier"] as UserRole[])
                .filter((r) => r !== role)
                .map((r) => {
                  const checked = extraRoles.includes(r);
                  return (
                    <label
                      key={r}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] cursor-pointer"
                      style={{
                        background: checked ? "rgba(83,58,253,0.08)" : "#ffffff",
                        color: checked ? "#4434d4" : "#273951",
                        border: checked ? "1px solid rgba(83,58,253,0.20)" : "1px solid #e5edf5",
                        borderRadius: 4,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleExtraRole(r)}
                        style={{ margin: 0 }}
                      />
                      {ROLE_LABELS[r]}
                    </label>
                  );
                })}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 text-[13px]"
              style={{
                background: "#ffffff",
                border: "1px solid #e5edf5",
                color: "#273951",
                borderRadius: 4,
              }}>Cancel</button>
            <button type="submit" disabled={loading || pwStrength.length > 0}
              className="flex-1 flex items-center justify-center gap-2 py-2 text-[13px] text-white disabled:opacity-60"
              style={{ background: "#533afd", borderRadius: 4, fontWeight: 400 }}>
              {loading && <Loader2 size={14} className="animate-spin" />}
              Create User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: SafeUser;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<UserRole>(user.role);
  const [extraRoles, setExtraRoles] = useState<UserRole[]>(
    (user.roles ?? []).filter((r): r is UserRole => r !== user.role && (ALL_ROLES as string[]).includes(r)),
  );
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function toggleExtraRole(r: UserRole) {
    setExtraRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  const pwStrength = password ? validatePw(password) : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password && pwStrength.length) { setErrors(pwStrength); return; }
    setErrors([]);
    setLoading(true);
    const body: Record<string, unknown> = {
      name,
      role,
      roles: Array.from(new Set([role, ...extraRoles])),
    };
    if (password) body.password = password;
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!res.ok) {
      setErrors([d.error ?? "Failed to update user"]);
      setLoading(false);
      return;
    }
    setLoading(false);
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(6,27,49,0.4)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md p-6"
        style={{
          background: "#ffffff",
          borderRadius: 8,
          boxShadow:
            "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.10) 0px 18px 36px -18px",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ color: "#061b31", fontSize: 18, fontWeight: 500 }}>Edit User</h2>
          <button onClick={onClose}><X size={16} style={{ color: "#64748d" }} /></button>
        </div>
        {errors.length > 0 && (
          <div
            className="mb-4 px-3 py-2"
            style={{
              background: "rgba(229,72,77,0.08)",
              border: "1px solid rgba(229,72,77,0.30)",
              borderRadius: 4,
            }}
          >
            {errors.map((e, i) => (
              <div key={i} className="text-[12px]" style={{ color: "#b03238" }}>&bull; {e}</div>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[12px] mb-1.5" style={{ color: "#273951", fontWeight: 500 }}>Full Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full px-3 py-2 text-[13px] outline-none"
              style={{ border: "1px solid #e5edf5", borderRadius: 4, color: "#061b31" }} />
          </div>
          <div>
            <label className="block text-[12px] mb-1.5" style={{ color: "#273951", fontWeight: 500 }}>Email</label>
            <input type="email" value={user.email} disabled
              className="w-full px-3 py-2 text-[13px] outline-none"
              style={{ border: "1px solid #e5edf5", borderRadius: 4, color: "#94a3b8", background: "#f6f9fc" }} />
          </div>
          <div>
            <label className="block text-[12px] mb-1.5" style={{ color: "#273951", fontWeight: 500 }}>Primary Role</label>
            <select value={role} onChange={(e) => {
                const newRole = e.target.value as UserRole;
                setRole(newRole);
                setExtraRoles((prev) => prev.filter((r) => r !== newRole));
              }}
              disabled={isSelf}
              className="w-full px-3 py-2 text-[13px] outline-none disabled:opacity-60"
              style={{ border: "1px solid #e5edf5", borderRadius: 4, color: "#061b31", background: "#ffffff" }}>
              <option value="csr">CSR (Customer Service Rep)</option>
              <option value="dispatcher">Dispatcher</option>
              <option value="supplier">Admin (Full Access)</option>
            </select>
            {isSelf && (
              <div className="text-[11px] mt-1" style={{ color: "#94a3b8" }}>
                You can't change your own primary role.
              </div>
            )}
          </div>
          <div>
            <label className="block text-[12px] mb-1.5" style={{ color: "#273951", fontWeight: 500 }}>
              Additional Roles <span style={{ color: "#64748d", fontWeight: 400 }}>(optional)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_ROLES
                .filter((r) => r !== role)
                .map((r) => {
                  const checked = extraRoles.includes(r);
                  return (
                    <label
                      key={r}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] cursor-pointer"
                      style={{
                        background: checked ? "rgba(83,58,253,0.08)" : "#ffffff",
                        color: checked ? "#4434d4" : "#273951",
                        border: checked ? "1px solid rgba(83,58,253,0.20)" : "1px solid #e5edf5",
                        borderRadius: 4,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleExtraRole(r)}
                        style={{ margin: 0 }}
                      />
                      {ROLE_LABELS[r]}
                    </label>
                  );
                })}
            </div>
          </div>
          <div>
            <label className="block text-[12px] mb-1.5" style={{ color: "#273951", fontWeight: 500 }}>
              Reset Password <span style={{ color: "#64748d", fontWeight: 400 }}>(leave blank to keep current)</span>
            </label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-[13px] outline-none"
              placeholder="••••••••"
              style={{ border: "1px solid #e5edf5", borderRadius: 4, color: "#061b31" }} />
            {password && pwStrength.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {[
                  { label: "8+ characters", ok: password.length >= 8 },
                  { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
                  { label: "Lowercase letter", ok: /[a-z]/.test(password) },
                  { label: "Number", ok: /[0-9]/.test(password) },
                ].map((r) => (
                  <div key={r.label} className="flex items-center gap-1.5 text-[11px]">
                    <div
                      className="w-2 h-2 flex-shrink-0"
                      style={{ background: r.ok ? "#15be53" : "#e5edf5", borderRadius: 4 }}
                    />
                    <span style={{ color: r.ok ? "#108c3d" : "#94a3b8" }}>{r.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 text-[13px]"
              style={{
                background: "#ffffff",
                border: "1px solid #e5edf5",
                color: "#273951",
                borderRadius: 4,
              }}>Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2 text-[13px] text-white disabled:opacity-60"
              style={{ background: "#533afd", borderRadius: 4, fontWeight: 400 }}>
              {loading && <Loader2 size={14} className="animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmModal({
  title, message, onConfirm, onCancel,
}: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(6,27,49,0.4)" }}
    >
      <div
        className="w-full max-w-sm p-6"
        style={{
          background: "#ffffff",
          borderRadius: 8,
          boxShadow:
            "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.10) 0px 18px 36px -18px",
        }}
      >
        <h2 style={{ color: "#061b31", fontSize: 16, fontWeight: 500, marginBottom: 6 }}>{title}</h2>
        <p className="text-[13px] mb-5" style={{ color: "#64748d" }}>{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 text-[13px]"
            style={{
              background: "#ffffff",
              border: "1px solid #e5edf5",
              color: "#273951",
              borderRadius: 4,
            }}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 text-[13px] text-white"
            style={{ background: "#e5484d", borderRadius: 4, fontWeight: 400 }}>Deactivate</button>
        </div>
      </div>
    </div>
  );
}
