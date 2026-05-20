"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PAGE_SIZE = 20;

type Ticket = {
  id: number;
  external_id: string | null;
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
  fecha_respuesta: string;
  hora_respuesta: string;
  accion_tomada: string;
  primer_contacto: boolean;
  tiempo_minutos: number;
  mes_atencion: string;
  categoria: string | null;
  porcentaje: number | null;
  estado: string;
};

type TicketsMeta = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

function formatDateTime(date?: string, time?: string) {
  if (!date) return "--";
  const datePart = date.includes("T") ? date.split("T")[0] : date;
  const [y, m, d] = datePart.split("-");
  const timePart = time ? time.split(".")[0] : date.includes("T") ? date.split("T")[1] || "" : "";
  const hhmm = timePart ? timePart.slice(0, 5) : "00:00";
  return `${y}/${m}/${d} ${hhmm}`;
}

export default function SeguimientoPage() {
  const [items, setItems] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [meta, setMeta] = useState<TicketsMeta>({
    page: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [tipoRegistro, setTipoRegistro] = useState("");
  const [externalId, setExternalId] = useState("");
  const [q, setQ] = useState("");
  const loadedRef = useRef(false);
  const reduceMotion = useReducedMotion();

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("mine", "true");
    params.set("pageSize", String(PAGE_SIZE));
    if (status) params.set("status", status);
    if (tipoRegistro) params.set("tipoRegistro", tipoRegistro);
    if (externalId) params.set("externalId", externalId);
    if (q) params.set("q", q);
    return params.toString();
  }, [externalId, q, status, tipoRegistro]);

  const fetchTickets = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    const separator = queryString ? "&" : "";
    const res = await fetch(`/api/tickets?${queryString}${separator}page=${page}`);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || "No se pudieron cargar tus tickets.");
      setLoading(false);
      return;
    }
    const data = await res.json();
    const nextItems = data.items || [];
    setItems(nextItems);
    setMeta(
      data.meta || {
        page,
        pageSize: PAGE_SIZE,
        totalItems: nextItems.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      }
    );
    setSelected((current) => {
      if (!nextItems.length) return null;
      if (!current) return nextItems[0];
      return nextItems.find((item: Ticket) => item.id === current.id) || nextItems[0];
    });
    setLoading(false);
  }, [queryString]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    queueMicrotask(() => {
      void fetchTickets(1);
    });
  }, [fetchTickets]);

  const resultsKey = `${queryString}:${meta.page}:${items.length}:${loading ? "loading" : "ready"}`;

  return (
    <main className="page">
      <section className="card">
        <div className="page-header">
          <span className="page-kicker">Seguimiento</span>
          <h1 className="page-title">Mis tickets</h1>
          <p className="page-copy">
            Revisa el estado actual de las solicitudes e incidentes que registraste y ubica su Ticket ID.
          </p>
        </div>
        <div className="filters">
          <label className="field">
            <span className="label">Estado</span>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="REGISTRADO">Registrado</option>
              <option value="EN_ATENCION">En atención</option>
              <option value="RESPONDIDO">Respondido</option>
              <option value="RESUELTO">Resuelto</option>
            </select>
          </label>
          <label className="field">
            <span className="label">Tipo</span>
            <select className="select" value={tipoRegistro} onChange={(e) => setTipoRegistro(e.target.value)}>
              <option value="">Todos</option>
              <option value="INCIDENTE">Incidente</option>
              <option value="SOPORTE">Soporte</option>
            </select>
          </label>
          <label className="field">
            <span className="label">Ticket ID</span>
            <input
              className="input"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="Ej. 426"
            />
          </label>
          <label className="field">
            <span className="label">Búsqueda</span>
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Descripción o motivo"
            />
          </label>
        </div>
        <div className="actions-row">
          <button className="button" onClick={() => void fetchTickets(1)} disabled={loading}>
            {loading ? "Cargando..." : "Buscar"}
          </button>
          <button
            className="nav-link"
            onClick={() => {
              setStatus("");
              setTipoRegistro("");
              setExternalId("");
              setQ("");
            }}
          >
            Limpiar
          </button>
        </div>
      </section>

      <section className="card">
        {error && <p className="error">{error}</p>}
        {!error && (
          <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 16 }}>
            <p className="muted">
              {loading ? "Consultando tickets..." : `Tienes ${meta.totalItems} tickets registrados.`}
            </p>
            <p className="muted">Solo se muestran tickets creados por tu usuario autenticado.</p>
          </div>
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={resultsKey}
            initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.995 }}
            animate={reduceMotion ? {} : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? {} : { opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {items.length === 0 ? (
              <p className="muted">No hay tickets para esos filtros.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ticket ID</th>
                      <th>Tipo</th>
                      <th>Servicio</th>
                      <th>Canal</th>
                      <th>Encargado</th>
                      <th>Estado</th>
                      <th>Reporte</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.external_id || `#${item.id}`}</td>
                        <td>{item.tipo_registro}</td>
                        <td>{item.tipo_servicio}</td>
                        <td>{item.canal_oficina}</td>
                        <td>{item.encargado}</td>
                        <td>{item.estado}</td>
                        <td>{formatDateTime(item.fecha_reporte, item.hora_reporte)}</td>
                        <td>
                          <button className={selected?.id === item.id ? "button" : "nav-link"} onClick={() => setSelected(item)}>
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="actions-row" style={{ justifyContent: "space-between", marginTop: 16 }}>
          <div className="actions-row">
            <button className="nav-link" onClick={() => void fetchTickets(meta.page - 1)} disabled={!meta.hasPreviousPage || loading}>
              Anterior
            </button>
            <button className="nav-link" onClick={() => void fetchTickets(meta.page + 1)} disabled={!meta.hasNextPage || loading}>
              Siguiente
            </button>
          </div>
          <p className="muted">Página {meta.page} de {meta.totalPages}</p>
        </div>
      </section>

      {selected && (
        <section className="card">
          <div className="page-header">
            <span className="page-kicker">{selected.external_id || `Ticket #${selected.id}`}</span>
            <h2 className="section-title">Detalle del ticket</h2>
          </div>
          <div className="filters">
            <div className="field">
              <span className="label">Estado</span>
              <p>{selected.estado}</p>
            </div>
            <div className="field">
              <span className="label">Encargado</span>
              <p>{selected.encargado}</p>
            </div>
            <div className="field">
              <span className="label">Tipo de servicio</span>
              <p>{selected.tipo_servicio}</p>
            </div>
            <div className="field">
              <span className="label">Canal / Oficina</span>
              <p>{selected.canal_oficina}</p>
            </div>
            <div className="field">
              <span className="label">Gerencia</span>
              <p>{selected.gerencia}</p>
            </div>
            <div className="field">
              <span className="label">Motivo</span>
              <p>{selected.motivo_servicio}</p>
            </div>
            <div className="field">
              <span className="label">Fecha de reporte</span>
              <p>{formatDateTime(selected.fecha_reporte, selected.hora_reporte)}</p>
            </div>
            <div className="field">
              <span className="label">Toma del ticket</span>
              <p>{formatDateTime(selected.fecha_toma || undefined, selected.hora_toma || undefined)}</p>
            </div>
            <div className="field">
              <span className="label">Resolución del ticket</span>
              <p>{formatDateTime(selected.fecha_respuesta, selected.hora_respuesta)}</p>
            </div>
          </div>
          <div className="stack" style={{ gap: 16 }}>
            <div className="field">
              <span className="label">Descripción</span>
              <p>{selected.descripcion}</p>
            </div>
            <div className="field">
              <span className="label">Resolución final</span>
              <p>{selected.accion_tomada || "Aún sin resolución final. Revisa el histórico operativo del equipo."}</p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
