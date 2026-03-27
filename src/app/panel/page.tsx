"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LayoutGrid } from "lucide-react";

type User = { id: number; username: string; role: string; roles?: string[] } | null;

type Tab = { label: string; href: string; roles: string[] };

export default function PanelPage() {
  const [user, setUser] = useState<User>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/auth/me");
      const data = await res.json().catch(() => ({}));
      setUser(data?.user ?? null);
    }
    void load();
  }, []);

  const tabs: Tab[] = useMemo(
    () => [
      { label: "Formulario de gestión", href: "/incidentes", roles: ["SOLICITANTE", "SOPORTE", "SUPERVISOR", "ADMIN"] },
      { label: "Solicitud de soporte", href: "/soporte", roles: ["SOLICITANTE", "SOPORTE", "SUPERVISOR", "ADMIN"] },
      { label: "Documentación API", href: "/docs", roles: ["SOPORTE", "SUPERVISOR", "ADMIN"] },
      { label: "Pendientes de asignación", href: "/admin/en-proceso", roles: ["SOPORTE", "SUPERVISOR", "ADMIN"] },
      { label: "Mis tickets", href: "/admin/mis-tickets", roles: ["SOPORTE", "SUPERVISOR", "ADMIN"] },
      { label: "Tickets", href: "/admin/resueltos", roles: ["SOPORTE", "SUPERVISOR", "ADMIN"] },
      { label: "Gráficos", href: "/admin/graficos", roles: ["SOPORTE", "SUPERVISOR", "ADMIN"] },
      { label: "Importar Excel", href: "/admin/importar", roles: ["ADMIN"] },
      { label: "Catálogos", href: "/admin/catalogos", roles: ["ADMIN"] },
      { label: "Usuarios", href: "/admin/usuarios", roles: ["ADMIN"] },
    ],
    []
  );

  const allowedTabs = user
    ? tabs.filter((t) => t.roles.some((r) => (user.roles && user.roles.length ? user.roles : [user.role]).includes(r)))
    : [];

  return (
    <main className="page">
      <header className="page-header">
        <h1 className="page-title">Panel principal</h1>
        <p className="page-subtitle">Accesos disponibles según tu rol.</p>
      </header>

      <motion.section
        className="card"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {!user ? (
          <p className="muted">Cargando usuario...</p>
        ) : (
          <div className="nav-links">
            {allowedTabs.map((tab) => (
              <a key={tab.href} className="nav-link" href={tab.href}>
                <LayoutGrid style={{ width: 16, height: 16, marginRight: 6 }} />
                {tab.label}
              </a>
            ))}
          </div>
        )}
      </motion.section>
    </main>
  );
}
