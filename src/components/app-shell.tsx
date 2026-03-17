"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutGrid, LogOut, Settings } from "lucide-react";

const links = [
  { label: "Formulario", href: "/incidentes", roles: ["SOLICITANTE", "SOPORTE", "SUPERVISOR", "ADMIN"] },
  { label: "Soporte", href: "/soporte", roles: ["SOLICITANTE", "SOPORTE", "SUPERVISOR", "ADMIN"] },
  { label: "Pendientes", href: "/admin/en-proceso", roles: ["SOPORTE", "SUPERVISOR", "ADMIN"] },
  { label: "Mis tickets", href: "/admin/mis-tickets", roles: ["SOPORTE", "SUPERVISOR", "ADMIN"] },
  { label: "Tickets", href: "/admin/resueltos", roles: ["SOPORTE", "SUPERVISOR", "ADMIN"] },
  { label: "Gráficos", href: "/admin/graficos", roles: ["SOPORTE", "SUPERVISOR", "ADMIN"] },
  { label: "Importar Excel", href: "/admin/importar", roles: ["ADMIN"] },
  { label: "Catálogos", href: "/admin/catalogos", roles: ["ADMIN"] },
  { label: "Usuarios", href: "/admin/usuarios", roles: ["ADMIN"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [passModal, setPassModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const pathname = usePathname();
  const hideChrome = pathname === "/" || pathname === "/login" || pathname === "/recuperar";

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/auth/me");
      const data = await res.json().catch(() => ({}));
      setUser(data?.user ?? null);
    }
    void load();
  }, []);

  const roles = user?.roles && user.roles.length ? user.roles : user?.role ? [user.role] : [];
  const allowedLinks = links.filter((l) => l.roles.some((r) => roles.includes(r)));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function changePassword(e: React.FormEvent) {
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

  return (
    <div className="app-shell">
      {!hideChrome && (
        <>
          <header className="app-header">
            <div className="app-brand">
              <div className="app-logo">MSI</div>
              <div>
                <div className="app-title">MSI Bolivia</div>
                <div className="app-tagline">Tu salud, tu elección, tu futuro</div>
              </div>
            </div>
            <nav className="app-nav">
              {allowedLinks.map((link) => (
                <a key={link.href} className="app-nav-link" href={link.href}>
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="app-user">
              <button className="nav-link" onClick={() => setOpen(!open)}>
                <LayoutGrid style={{ width: 16, height: 16 }} />
                {user?.full_name || user?.username || "Cuenta"}
              </button>
              {open && (
                <div className="app-user-menu">
                  <button className="nav-link" onClick={() => { setPassModal(true); setOpen(false); }}>
                    <Settings style={{ width: 16, height: 16 }} />
                    Cambiar contraseña
                  </button>
                  <button className="nav-link" onClick={logout}>
                    <LogOut style={{ width: 16, height: 16 }} />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </header>
          <section className="app-hero">
            <div className="app-hero-inner">
              <div className="app-hero-badge">Panel operativo</div>
              <h1 className="app-hero-title">Gestión de Incidentes y Soporte</h1>
              <p className="app-hero-subtitle">
                Accesos y métricas ajustadas a tu rol.
              </p>
            </div>
          </section>
        </>
      )}
      <div className={hideChrome ? "" : "app-content"}>{children}</div>

      {passModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2 className="page-title" style={{ fontSize: "1.4rem" }}>Cambiar contraseña</h2>
            <form className="form" onSubmit={changePassword}>
              <label className="field">
                <span className="label">Contraseña actual</span>
                <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              </label>
              <label className="field">
                <span className="label">Nueva contraseña</span>
                <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              </label>
              {message && <p className="muted">{message}</p>}
              <div style={{ display: "flex", gap: 12 }}>
                <button className="button" type="submit">Guardar</button>
                <button className="nav-link" type="button" onClick={() => setPassModal(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
