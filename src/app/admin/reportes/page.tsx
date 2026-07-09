"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Download, FileSpreadsheet, Search } from "lucide-react";
import { useState } from "react";

type ReportMeta = {
  totalItems: number;
  fechaDesde: string;
  fechaHasta: string;
};

export default function ReportesPage() {
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  async function consultar() {
    if (!fechaDesde || !fechaHasta) {
      setError("Debes seleccionar una fecha inicial y una final.");
      return;
    }
    if (fechaDesde > fechaHasta) {
      setError("La fecha inicial no puede ser mayor a la fecha final.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({ fechaDesde, fechaHasta });
      const res = await fetch(`/api/reportes/resueltos?${query.toString()}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "No se pudo generar el reporte");
      }

      setMeta(data.meta || null);
    } catch (err) {
      setMeta(null);
      setError(err instanceof Error ? err.message : "No se pudo generar el reporte");
    } finally {
      setLoading(false);
    }
  }

  async function exportarXlsx() {
    if (!meta) return;
    setExporting(true);
    try {
      const query = new URLSearchParams({
        fechaDesde: meta.fechaDesde,
        fechaHasta: meta.fechaHasta,
      });
      const res = await fetch(`/api/reportes/kpi-export?${query.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "No se pudo exportar el reporte KPI");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `reporte_kpi_${meta.fechaDesde}_a_${meta.fechaHasta}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo exportar el reporte KPI");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="page">
      <section className="hero-panel hero-panel--compact">
        <div className="hero-panel__content">
          <div className="page-header">
            <span className="page-kicker">Módulo de reportes</span>
            <h1 className="page-title">Exportación XLSX por rango</h1>
            <p className="page-copy">Genera el detalle y la hoja ejecutiva KPI en un Excel por rango de fechas.</p>
          </div>
          <div className="hero-panel__meta">
            <span className="topbar-chip topbar-chip--accent">
              <FileSpreadsheet size={14} />
              {meta ? `${meta.totalItems} registros listos` : "Sin consulta ejecutada"}
            </span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="filters">
          <label className="field">
            <span className="label">Fecha desde</span>
            <input className="input" type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Fecha hasta</span>
            <input className="input" type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
          </label>
        </div>
        <div className="actions-row">
          <button className="button" onClick={() => void consultar()} disabled={loading}>
            <Search size={15} />
            {loading ? "Consultando..." : "Generar reporte"}
          </button>
          <button className="nav-link" onClick={() => void exportarXlsx()} disabled={!meta || exporting}>
            <Download size={15} />
            {exporting ? "Exportando..." : "Exportar XLSX KPI"}
          </button>
          <button
            className="nav-link"
            onClick={() => {
              setFechaDesde("");
              setFechaHasta("");
              setMeta(null);
              setError(null);
            }}
          >
            Limpiar
          </button>
        </div>
      </section>

      <section className="card">
        {error && <p className="error">{error}</p>}
        {!error && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={reduceMotion ? {} : { opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {meta ? (
              <p className="muted">
                Se encontraron {meta.totalItems} registros entre {meta.fechaDesde} y {meta.fechaHasta}.
              </p>
            ) : (
              <p className="muted">Selecciona un rango y genera el reporte para habilitar la exportación.</p>
            )}
          </motion.div>
        )}
      </section>
    </main>
  );
}
