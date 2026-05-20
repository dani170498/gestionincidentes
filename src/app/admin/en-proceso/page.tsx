"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Inbox, RefreshCcw, Ticket as TicketIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  tiempo_minutos: number;
  estado: string;
};

type CatalogItem = { id: number; name: string; active: boolean };

function isResolvedTicket(ticket: Pick<Ticket, "estado">) {
  return ticket.estado === "RESUELTO";
}

function formatDateTime(date?: string | null, time?: string | null) {
  if (!date) return "Sin registro";
  const datePart = date.includes("T") ? date.split("T")[0] : date;
  const [y, m, d] = datePart.split("-");
  const timePart = time ? time.split(".")[0] : date.includes("T") ? date.split("T")[1] || "" : "";
  const hhmm = timePart ? timePart.slice(0, 5) : "00:00";
  return `${d}/${m}/${y} ${hhmm}`;
}

export default function EnProcesoPage() {
  const [items, setItems] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tipoServicio, setTipoServicio] = useState("");
  const [canal, setCanal] = useState("");
  const [gerencia, setGerencia] = useState("");
  const [tipoRegistro, setTipoRegistro] = useState("SOPORTE");
  const [mes, setMes] = useState("");
  const [q, setQ] = useState("");

  const [serviceTypes, setServiceTypes] = useState<CatalogItem[]>([]);
  const [channels, setChannels] = useState<CatalogItem[]>([]);
  const [gerencias, setGerencias] = useState<CatalogItem[]>([]);
  const loadedRef = useRef(false);
  const reduceMotion = useReducedMotion();

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("cola", "sin_asignar");
    if (tipoServicio) params.set("tipoServicio", tipoServicio);
    if (canal) params.set("canal", canal);
    if (gerencia) params.set("gerencia", gerencia);
    if (tipoRegistro) params.set("tipoRegistro", tipoRegistro);
    if (mes) params.set("mes", mes);
    if (q) params.set("q", q);
    return params.toString();
  }, [tipoServicio, canal, gerencia, tipoRegistro, mes, q]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    async function loadInitialState() {
      const [tipoRes, canalRes, gerRes] = await Promise.all([
        fetch("/api/catalogos/tiposervicio"),
        fetch("/api/catalogos/canaloficina"),
        fetch("/api/catalogos/gerencia"),
      ]);
      const [tipoData, canalData, gerData] = await Promise.all([
        tipoRes.json(),
        canalRes.json(),
        gerRes.json(),
      ]);
      setServiceTypes(tipoData.items || []);
      setChannels(canalData.items || []);
      setGerencias(gerData.items || []);
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/tickets?${queryString}`);
      if (!res.ok) {
        setError("No se pudieron cargar los tickets pendientes");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setItems(data.items || []);
      setLoading(false);
    }
    void loadInitialState();
  }, [queryString]);

  async function fetchTickets() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/tickets?${queryString}`);
    if (!res.ok) {
      setError("No se pudieron cargar los tickets pendientes");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }

  async function takeTicket(id: number) {
    setError(null);
    const res = await fetch(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "take" }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || "No se pudo tomar el ticket");
      return;
    }
    void fetchTickets();
  }

  const resultsKey = `${queryString}:${items.length}:${loading ? "loading" : "ready"}`;

  return (
    <main className="page">
      <section className="hero-panel hero-panel--compact">
        <div className="hero-panel__content">
          <div className="page-header">
            <span className="page-kicker">Cola de entrada</span>
            <h1 className="page-title">Tickets sin asignar</h1>
            <p className="page-copy">
              Filtra la cola antes de tomar un ticket. La tabla ahora prioriza contexto suficiente para decidir sin abrir
              vistas adicionales.
            </p>
          </div>
          <div className="hero-panel__meta">
            <span className="topbar-chip topbar-chip--accent">
              <Inbox size={14} />
              {items.length} tickets visibles
            </span>
            <span className="topbar-chip">
              <TicketIcon size={14} />
              {tipoRegistro || "Todos los tipos"}
            </span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="page-header" style={{ marginBottom: 18 }}>
          <h2 className="section-title">Filtra por servicio, canal o texto</h2>
          <p className="page-lead">Usa la búsqueda para reducir la cola antes de tomar propiedad del ticket.</p>
        </div>
        <div className="filters">
          <label className="field">
            <span className="label">Tipo de servicio</span>
            <select className="select" value={tipoServicio} onChange={(e) => setTipoServicio(e.target.value)}>
              <option value="">Todos</option>
              {serviceTypes.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Canal / Oficina</span>
            <select className="select" value={canal} onChange={(e) => setCanal(e.target.value)}>
              <option value="">Todos</option>
              {channels.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Gerencia</span>
            <select className="select" value={gerencia} onChange={(e) => setGerencia(e.target.value)}>
              <option value="">Todas</option>
              {gerencias.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Tipo de registro</span>
            <select className="select" value={tipoRegistro} onChange={(e) => setTipoRegistro(e.target.value)}>
              <option value="">Todos</option>
              <option value="INCIDENTE">Incidente</option>
              <option value="SOPORTE">Soporte</option>
            </select>
          </label>
          <label className="field">
            <span className="label">Mes</span>
            <input className="input" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Búsqueda</span>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Solicitante o descripción" />
          </label>
        </div>
        <div className="actions-row">
          <button className="button" onClick={fetchTickets} disabled={loading}>
            <RefreshCcw size={15} />
            {loading ? "Cargando..." : "Buscar"}
          </button>
          <button
            className="nav-link"
            onClick={() => {
              setTipoServicio("");
              setCanal("");
              setGerencia("");
              setTipoRegistro("SOPORTE");
              setMes("");
              setQ("");
              setError(null);
            }}
          >
            Limpiar
          </button>
        </div>
      </section>

      <section className="card">
        {error && <p className="error">{error}</p>}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={resultsKey}
            initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.995 }}
            animate={reduceMotion ? {} : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? {} : { opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {items.length === 0 ? (
              <div className="empty-state">
                <strong>No hay tickets sin asignar con esos filtros.</strong>
                <p className="muted">Prueba otro rango o limpia filtros para volver a la cola completa.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ticket ID</th>
                      <th>Solicitante</th>
                      <th>Ruta</th>
                      <th>Seguimiento</th>
                      <th>Motivo y descripción</th>
                      <th>Estado</th>
                      <th>Toma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="table-cell-stack">
                            <strong className="table-primary">{item.external_id || `#${item.id}`}</strong>
                            <span className="table-secondary">{item.tipo_registro}</span>
                          </div>
                        </td>
                        <td>
                          <div className="table-cell-stack">
                            <strong className="table-primary">{item.solicitante}</strong>
                            <span className="table-secondary">{item.gerencia}</span>
                          </div>
                        </td>
                        <td>
                          <div className="table-cell-stack">
                            <strong className="table-primary">{item.tipo_servicio}</strong>
                            <span className="table-secondary">{item.canal_oficina}</span>
                          </div>
                        </td>
                        <td>
                          <div className="table-cell-stack">
                            <strong className="table-primary">
                              Reporte: {formatDateTime(item.fecha_reporte, item.hora_reporte)}
                            </strong>
                            <span className="table-secondary">
                              Toma: {formatDateTime(item.fecha_toma, item.hora_toma)}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="table-cell-stack">
                            <strong className="table-primary">{item.motivo_servicio}</strong>
                            <span className="table-secondary line-clamp-2">{item.descripcion}</span>
                          </div>
                        </td>
                        <td>
                          <span className="status-chip status-chip--warning">{item.estado.replaceAll("_", " ")}</span>
                        </td>
                        <td>
                          {isResolvedTicket(item) ? (
                            <span className="status-chip status-chip--success">Ticket cerrado</span>
                          ) : (
                            <button className="button" onClick={() => void takeTicket(item.id)}>
                              Tomar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </section>
    </main>
  );
}
