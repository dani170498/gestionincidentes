"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Download, FileSpreadsheet, Search } from "lucide-react";
import { useState } from "react";

type ReportItem = {
  id: number;
  tipo_registro: string;
  solicitante: string;
  tipo_servicio: string;
  canal_oficina: string;
  gerencia: string;
  motivo_servicio: string;
  descripcion: string;
  encargado: string;
  fecha_reporte: string;
  hora_reporte: string;
  fecha_toma: string | null;
  hora_toma: string | null;
  fecha_respuesta: string | null;
  hora_respuesta: string | null;
  accion_tomada: string;
  primer_contacto: boolean;
  tiempo_minutos: number;
  mes_atencion: string;
  categoria: string | null;
  porcentaje: number | null;
  estado: string;
};

type ReportMeta = {
  totalItems: number;
  fechaDesde: string;
  fechaHasta: string;
};

function formatDateTime(date?: string | null, time?: string | null) {
  if (!date) return "--";
  const datePart = date.includes("T") ? date.split("T")[0] : date;
  const [y, m, d] = datePart.split("-");
  const timePart = time
    ? time.split(".")[0]
    : date.includes("T")
      ? date.split("T")[1] || ""
      : "";
  const hhmm = timePart ? timePart.slice(0, 5) : "00:00";
  return `${y}/${m}/${d} ${hhmm}`;
}

export default function ReportesPage() {
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [items, setItems] = useState<ReportItem[]>([]);
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

      setItems(data.items || []);
      setMeta(data.meta || null);
    } catch (err) {
      setItems([]);
      setMeta(null);
      setError(err instanceof Error ? err.message : "No se pudo generar el reporte");
    } finally {
      setLoading(false);
    }
  }

  async function exportarXlsx() {
    if (items.length === 0 || !meta) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = items.map((item) => ({
        id: item.id,
        tipo_registro: item.tipo_registro,
        solicitante: item.solicitante,
        tipo_servicio: item.tipo_servicio,
        canal_oficina: item.canal_oficina,
        gerencia: item.gerencia,
        motivo_servicio: item.motivo_servicio,
        descripcion: item.descripcion,
        encargado: item.encargado,
        mes_atencion: item.mes_atencion,
        reporte: formatDateTime(item.fecha_reporte, item.hora_reporte),
        toma: formatDateTime(item.fecha_toma, item.hora_toma),
        resolucion: formatDateTime(item.fecha_respuesta, item.hora_respuesta),
        accion_tomada: item.accion_tomada,
        primer_contacto: item.primer_contacto ? "Sí" : "No",
        tiempo_minutos: item.tiempo_minutos,
        categoria: item.categoria ?? "",
        porcentaje: item.porcentaje ?? "",
        estado: item.estado,
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
      XLSX.writeFile(workbook, `reporte_tickets_${meta.fechaDesde}_a_${meta.fechaHasta}.xlsx`);
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
            <p className="page-copy">
              Genera el mismo detalle del Excel de tickets usando un rango de fechas de reporte.
            </p>
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
          <button className="nav-link" onClick={exportarXlsx} disabled={items.length === 0 || exporting}>
            <Download size={15} />
            {exporting ? "Exportando..." : "Exportar XLSX"}
          </button>
          <button
            className="nav-link"
            onClick={() => {
              setFechaDesde("");
              setFechaHasta("");
              setItems([]);
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
