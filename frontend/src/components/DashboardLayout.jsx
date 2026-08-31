import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Truck, Wrench, Users, FileText, CalendarRange, Shield, LogOut,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";

const items = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/units", label: "Katalog Unit", icon: Truck },
  { to: "/app/spareparts", label: "Suku Cadang", icon: Wrench, roles: ["warehouse_staff", "sales_manager"] },
  { to: "/app/crm", label: "CRM & Klien", icon: Users, roles: ["sales_manager"] },
  { to: "/app/quotations", label: "Quotation", icon: FileText, roles: ["sales_manager"] },
  { to: "/app/rentals", label: "Rental", icon: CalendarRange, roles: ["sales_manager"] },
  { to: "/app/users", label: "User Management", icon: Shield, roles: [] }, // superadmin only
];

function roleLabel(r) {
  return { superadmin: "SuperAdmin", sales_manager: "Sales Manager", warehouse_staff: "Warehouse Staff" }[r] || r;
}

export default function DashboardLayout() {
  const { user, logout, hasRole } = useAuth();
  const nav = useNavigate();

  const doLogout = async () => {
    await logout();
    nav("/login");
  };

  const visibleItems = items.filter((i) => {
    if (i.to === "/app/users") return user?.role === "superadmin";
    if (!i.roles) return true;
    return hasRole(...i.roles);
  });

  return (
    <div className="min-h-screen flex bg-[#f6f6f4]">
      {/* Sidebar */}
      <aside className="w-64 bg-neutral-950 text-white flex flex-col fixed h-screen border-r border-white/5">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="SANY PERKASA" className="w-9 h-9 object-contain rounded-full bg-white shrink-0" />
            <div>
              <div className="font-display font-black tracking-tight text-sm leading-none">SANY <span className="text-[#E60012]">PERKASA</span></div>
              <div className="font-mono text-[9px] tracking-widest uppercase text-white/40 mt-1">CMS v2026</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {visibleItems.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.end}
              data-testid={`nav-${i.label.toLowerCase().replace(/\s|&/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                  isActive
                    ? "bg-[#E60012] text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <i.icon className="w-4 h-4" />
              <span>{i.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-[#E60012] flex items-center justify-center font-display font-black">
              {user?.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="font-mono text-[9px] tracking-widest uppercase text-white/40">{roleLabel(user?.role)}</div>
            </div>
          </div>
          <Button
            onClick={doLogout}
            data-testid="logout-btn"
            variant="outline"
            className="w-full bg-transparent border-white/10 hover:bg-white/5 hover:text-white text-white/70 rounded-none h-10 font-mono text-[10px] uppercase tracking-widest"
          >
            <LogOut className="w-3 h-3 mr-2" /> Logout
          </Button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 ml-64 min-w-0">
        <motion.div
          key={typeof window !== "undefined" ? window.location.pathname : ""}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="p-8 lg:p-10 max-w-[1600px]"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
