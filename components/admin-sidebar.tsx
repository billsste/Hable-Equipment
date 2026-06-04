"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  SlidersHorizontal,
  Users,
  ClipboardList,
  ShieldCheck,
  LogOut,
  LifeBuoy,
  ListChecks,
  BarChart3,
  Menu,
  X,
} from "lucide-react";

type UserRole = "supplier" | "driver" | "csr";

type SidebarUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: UserRole[];
};

// 2026-06: Schedule + Inventory hidden from nav per Brent — the routes
// still resolve if someone has the URL; just not surfaced. Configuration
// renamed to "Dropdown Selections" since that's all it manages.
const NAV_ITEMS: NavItem[] = [
  { label: "Tracker",            href: "/tracker",       icon: <ListChecks size={18} />,         roles: ["supplier", "driver", "csr"] },
  { label: "Reporting",          href: "/reporting",     icon: <BarChart3 size={18} />,          roles: ["supplier"] },
  { label: "Dropdown Selections", href: "/configuration", icon: <SlidersHorizontal size={18} />, roles: ["supplier"] },
  { label: "Users",              href: "/users",         icon: <Users size={18} />,              roles: ["supplier"] },
  { label: "Audit Log",          href: "/audit-log",     icon: <ClipboardList size={18} />,      roles: ["supplier"] },
  { label: "Support",            href: "/support",       icon: <LifeBuoy size={18} />,           roles: ["supplier", "driver", "csr"] },
  { label: "Account",            href: "/account",       icon: <ShieldCheck size={18} />,        roles: ["supplier", "driver", "csr"] },
];

const ROLE_LABELS: Record<UserRole, string> = {
  supplier: "Administrator",
  csr:      "Customer Service",
  driver:   "Driver",
};

export default function AdminSidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Per Brent 2026-06: every nav item is visible to every authenticated
  // user — no role-based hiding. Per-item roles are kept on NAV_ITEMS for
  // documentation but ignored at render.
  const visibleItems = NAV_ITEMS;
  const initials = user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const body = (
    <>
      {/* Brand */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 20px",
          borderBottom: "1px solid #e5edf5",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontWeight: 500,
            fontSize: 12,
            flexShrink: 0,
            background: "#533afd",
          }}
        >
          ED
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2, color: "#061b31" }}>
            EquipDispatch
          </div>
          <div style={{ fontSize: 11, color: "#64748d" }}>Nursing equipment</div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
          className="md:hidden"
          style={{
            padding: 4,
            color: "#64748d",
            borderRadius: 4,
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {visibleItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <a
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                minHeight: 40,
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                transition: "background-color 100ms",
                background: isActive ? "rgba(83,58,253,0.08)" : "transparent",
                color: isActive ? "#533afd" : "#64748d",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.background = "#f6f9fc";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                }
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  color: isActive ? "#533afd" : "#94a3b8",
                }}
              >
                {item.icon}
              </span>
              <span style={{ flex: 1 }}>{item.label}</span>
            </a>
          );
        })}
      </nav>

      {/* HIPAA pill */}
      <div style={{ padding: "0 12px 12px" }}>
        <a
          href="/hipaa"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "6px 10px",
            borderRadius: 4,
            fontSize: 12,
            background: "rgba(21,190,83,0.12)",
            color: "#108c3d",
            border: "1px solid rgba(21,190,83,0.30)",
            textDecoration: "none",
          }}
        >
          <ShieldCheck size={14} />
          HIPAA Compliant
        </a>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderTop: "1px solid #e5edf5",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 500,
            color: "#ffffff",
            background: "#533afd",
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "#061b31",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.2,
            }}
          >
            {user.name}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#64748d",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              textTransform: "capitalize",
              lineHeight: 1.3,
            }}
          >
            {ROLE_LABELS[user.role]}
          </div>
        </div>
        <button
          onClick={handleLogout}
          title="Sign out"
          style={{
            flexShrink: 0,
            padding: 4,
            borderRadius: 4,
            color: "#64748d",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "color 100ms",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#e5484d")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#64748d")}
        >
          <LogOut size={14} />
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar — only shown <md */}
      <div
        suppressHydrationWarning
        className="flex md:hidden"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          background: "#ffffff",
          borderBottom: "1px solid #e5edf5",
        }}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 6,
            border: "1px solid #e5edf5",
            background: "#ffffff",
            color: "#273951",
          }}
        >
          <Menu size={18} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: 10,
              background: "#533afd",
              flexShrink: 0,
            }}
          >
            ED
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#061b31" }}>EquipDispatch</div>
        </div>
      </div>

      {/* Desktop sidebar — flex flow, only shown md+ */}
      <aside
        className="hidden md:flex"
        style={{
          flexDirection: "column",
          width: 240,
          flexShrink: 0,
          height: "100vh",
          background: "#ffffff",
          borderRight: "1px solid #e5edf5",
        }}
      >
        {body}
      </aside>

      {/* Mobile drawer — fixed overlay, only shown <md when open */}
      {mobileOpen && (
        <div
          className="md:hidden"
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(6,27,49,0.45)",
            zIndex: 40,
          }}
        />
      )}
      <aside
        suppressHydrationWarning
        className="flex md:hidden"
        style={{
          position: "fixed",
          left: mobileOpen ? 0 : -260,
          top: 0,
          zIndex: 50,
          flexDirection: "column",
          width: 240,
          height: "100vh",
          background: "#ffffff",
          borderRight: "1px solid #e5edf5",
          transition: "left 200ms ease",
          boxShadow: mobileOpen ? "0 8px 30px rgba(0,0,0,0.18)" : "none",
        }}
      >
        {body}
      </aside>
    </>
  );
}
