"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType, FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowRightLeft,
  BookOpenText,
  ChartColumn,
  CircleUserRound,
  FileSpreadsheet,
  FolderCog,
  LayoutDashboard,
  LogOut,
  MoonStar,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  SunMedium,
  Ticket,
  UserCog,
  Wrench,
} from "lucide-react";

type NavLink = {
  label: string;
  href: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  roles: string[];
  group: string;
};

type SessionUser = {
  username?: string;
  full_name?: string;
  role?: string;
  roles?: string[];
} | null;

const links: NavLink[] = [
  {
    label: "Panel principal",
    href: "/panel",
    hint: "Resumen de accesos y prioridades",
    icon: LayoutDashboard,
    roles: ["SOLICITANTE", "SOPORTE", "SUPERVISOR", "ADMIN"],
    group: "Operación",
  },
  {
    label: "Registro de incidentes",
    href: "/incidentes",
    hint: "Alta completa con tiempos y KPIs",
    icon: Ticket,
    roles: ["SOLICITANTE", "SOPORTE", "SUPERVISOR", "ADMIN"],
    group: "Operación",
  },
  {
    label: "Solicitud de soporte",
    href: "/soporte",
    hint: "Ingreso simple a la cola de IT",
    icon: Wrench,
    roles: ["SOLICITANTE", "SOPORTE", "SUPERVISOR", "ADMIN"],
    group: "Operación",
  },
  {
    label: "Seguimiento",
    href: "/seguimiento",
    hint: "Consulta el estado de tus tickets",
    icon: CircleUserRound,
    roles: ["SOLICITANTE", "SOPORTE", "SUPERVISOR", "ADMIN"],
    group: "Seguimiento",
  },
  {
    label: "Pendientes",
    href: "/admin/en-proceso",
    hint: "Tickets sin asignar",
    icon: ArrowRightLeft,
    roles: ["SOPORTE", "SUPERVISOR", "ADMIN"],
    group: "Seguimiento",
  },
  {
    label: "Mis tickets",
    href: "/admin/mis-tickets",
    hint: "Atención, histórico y reasignación",
    icon: ShieldCheck,
    roles: ["SOPORTE", "SUPERVISOR", "ADMIN"],
    group: "Seguimiento",
  },
  {
    label: "Tickets",
    href: "/admin/resueltos",
    hint: "Consulta global y exportación",
    icon: ChartColumn,
    roles: ["SOPORTE", "SUPERVISOR", "ADMIN"],
    group: "Seguimiento",
  },
  {
    label: "Gráficos",
    href: "/admin/graficos",
    hint: "Distribución por causa y tiempo",
    icon: ChartColumn,
    roles: ["SOPORTE", "SUPERVISOR", "ADMIN"],
    group: "Seguimiento",
  },
  {
    label: "Dashboard",
    href: "/admin/dashboard",
    hint: "KPIs, tendencias y detalle filtrable",
    icon: LayoutDashboard,
    roles: ["SOPORTE", "SUPERVISOR", "ADMIN"],
    group: "Seguimiento",
  },
  {
    label: "Documentación API",
    href: "/docs",
    hint: "Integraciones y ejemplos",
    icon: BookOpenText,
    roles: ["SOPORTE", "SUPERVISOR", "ADMIN"],
    group: "Plataforma",
  },
  {
    label: "Importar CSV",
    href: "/admin/importar",
    hint: "Carga masiva de registros",
    icon: FileSpreadsheet,
    roles: ["ADMIN"],
    group: "Administración",
  },
  {
    label: "Catálogos",
    href: "/admin/catalogos",
    hint: "Parámetros operativos",
    icon: FolderCog,
    roles: ["ADMIN"],
    group: "Administración",
  },
  {
    label: "Usuarios",
    href: "/admin/usuarios",
    hint: "Control de accesos y roles",
    icon: UserCog,
    roles: ["ADMIN"],
    group: "Administración",
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser>(null);
  const [open, setOpen] = useState(false);
  const [passModal, setPassModal] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const hideChrome = pathname === "/" || pathname === "/login" || pathname === "/recuperar";

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/auth/me");
      const data = await res.json().catch(() => ({}));
      setUser(data?.user ?? null);
    }
    void load();
  }, []);

  useEffect(() => {
    setMounted(true);
    const stored = window.localStorage.getItem("app-sidebar-collapsed");
    setSidebarCollapsed(stored === "1");
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem("app-sidebar-collapsed", sidebarCollapsed ? "1" : "0");
  }, [mounted, sidebarCollapsed]);

  const roles = user?.roles && user.roles.length ? user.roles : user?.role ? [user.role] : [];
  const allowedLinks = links.filter((link) => link.roles.some((role) => roles.includes(role)));
  const groupedLinks = allowedLinks.reduce<Record<string, NavLink[]>>((groups, link) => {
    groups[link.group] ??= [];
    groups[link.group].push(link);
    return groups;
  }, {});

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data?.error || "No se pudo cambiar la contraseña");
      return;
    }
    setMessage("Contraseña actualizada");
    setCurrentPassword("");
    setNewPassword("");
  }

  if (hideChrome) {
    return <div className="app-shell">{children}</div>;
  }

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <div className="app-shell">
      <div className={`app-shell__frame ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <aside className={`app-shell__sidebar ${sidebarCollapsed ? "is-collapsed" : ""}`}>
          <div className="app-shell__sidebar-header">
            <div className="app-shell__brand">
              <div className="app-brand-mark">
                <Image
                  src="/images/logos/logomsi.png"
                  alt="MSI Bolivia"
                  width={56}
                  height={56}
                  className="app-logo-image"
                />
              </div>
              {!sidebarCollapsed && (
                <div className="app-brand-copy">
                  <span className="app-kicker">Atención de tickets IT</span>
                  <h1 className="app-title">MSI Bolivia</h1>
                </div>
              )}
            </div>
            <button
              className="app-shell__sidebar-toggle"
              onClick={() => setSidebarCollapsed((value) => !value)}
              type="button"
              aria-label={sidebarCollapsed ? "Mostrar panel lateral" : "Ocultar panel lateral"}
              title={sidebarCollapsed ? "Mostrar panel lateral" : "Ocultar panel lateral"}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          <nav className="app-nav">
            {Object.entries(groupedLinks).map(([group, groupLinks]) => (
              <div key={group} className="app-nav-group">
                {!sidebarCollapsed && <div className="app-nav-label">{group}</div>}
                {groupLinks.map((link) => {
                  const Icon = link.icon;
                  const active = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`app-nav-link ${active ? "active" : ""}`}
                      title={link.label}
                    >
                      <Icon className="h-4 w-4" />
                      {!sidebarCollapsed && (
                        <span>
                          <strong>{link.label}</strong>
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="app-user">
            <button className="nav-link app-user-trigger" onClick={() => setOpen(!open)} type="button">
              <div className="app-user-summary">
                <div className="app-user-avatar">
                  <CircleUserRound className="h-4 w-4" />
                </div>
                {!sidebarCollapsed && (
                  <div className="app-user-meta">
                    <strong>{user?.full_name || user?.username || "Cuenta"}</strong>
                    <span>{roles[0] || "Sesión activa"}</span>
                  </div>
                )}
              </div>
              {!sidebarCollapsed && <Settings className="h-4 w-4" />}
            </button>

            {open && (
              <div className="app-user-menu">
                <button
                  className="nav-link"
                  onClick={() => {
                    setTheme(isDark ? "light" : "dark");
                    setOpen(false);
                  }}
                  type="button"
                >
                  {isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
                  {isDark ? "Modo claro" : "Modo oscuro"}
                </button>
                <button
                  className="nav-link"
                  onClick={() => {
                    setPassModal(true);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <Settings className="h-4 w-4" />
                  Cambiar contraseña
                </button>
                <button className="nav-link" onClick={logout} type="button">
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </aside>

        <div className="app-shell__main">
          <div className="app-topbar">
            <div className="app-topbar__title">
              <span className="page-kicker">Atención de tickets IT</span>
              <strong>MSI Bolivia</strong>
            </div>
            <div className="app-topbar__actions">
              <button
                className="nav-link app-topbar__action"
                onClick={() => setSidebarCollapsed((value) => !value)}
                type="button"
              >
                {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                <span>{sidebarCollapsed ? "Mostrar panel" : "Ocultar panel"}</span>
              </button>
              <button
                className="nav-link app-topbar__action"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                type="button"
              >
                {isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
                <span>{isDark ? "Modo claro" : "Modo oscuro"}</span>
              </button>
            </div>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              className="app-content"
              initial={reduceMotion ? false : { opacity: 0, y: 14, filter: "blur(4px)" }}
              animate={reduceMotion ? {} : { opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduceMotion ? {} : { opacity: 0, y: -10, filter: "blur(3px)" }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {passModal && (
        <div className="modal-backdrop">
          <div className="modal modal--nested">
            <div className="page-header">
              <span className="page-kicker">Seguridad</span>
              <h2 className="section-title">Actualizar contraseña</h2>
              <p className="page-subtitle">Mantén la cuenta operativa protegida con una clave nueva.</p>
            </div>
            <form className="form" onSubmit={changePassword}>
              <label className="field">
                <span className="label">Contraseña actual</span>
                <input
                  className="input"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="label">Nueva contraseña</span>
                <input
                  className="input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </label>
              {message && <p className={message.includes("actualizada") ? "success" : "error"}>{message}</p>}
              <div className="actions-row">
                <button className="button" type="submit">
                  Guardar cambio
                </button>
                <button className="nav-link" type="button" onClick={() => setPassModal(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
