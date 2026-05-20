"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ClipboardList, History, RefreshCcw, Save, Send, Shuffle, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Ticket = {
  id: number;
  tipo_registro?: string;
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
  categoria: string | null;
  porcentaje: number | null;
  regla_porcentaje: string | null;
  estado: string;
};

type TicketAction = {
  id: number;
  incident_id: number;
  action_text: string;
  created_at: string;
  created_by_name: string;
};

type SupportUser = { id: number; name: string };
type CatalogItem = { id: number; name: string; active: boolean };
type MotivoItem = CatalogItem & { service_type_id: number };
type TicketTab = "TODOS" | "EN_ATENCION" | "RESPONDIDO" | "RESUELTO";
type ReassignStep = "select" | "confirm" | "done";

type EditState = {
  gerencia: string;
  motivo_servicio: string;
  accion_tomada: string;
  fecha_respuesta: string;
  hora_respuesta: string;
  primer_contacto: boolean;
  estado: string;
};

function statusTone(status: string) {
  switch (status) {
    case "RESUELTO":
      return "status-chip status-chip--success";
    case "RESPONDIDO":
      return "status-chip status-chip--warning";
    case "EN_ATENCION":
      return "status-chip status-chip--info";
    default:
      return "status-chip";
  }
}

function slaTone(minutes: number) {
  if (minutes >= 240) return "status-chip status-chip--danger";
  if (minutes >= 120) return "status-chip status-chip--warning";
  return "status-chip status-chip--success";
}

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

function toDateValue(value?: string) {
  if (!value) return "";
  return value.includes("T") ? value.split("T")[0] : value;
}

function toTimeValue(value?: string) {
  if (!value) return "";
  return value.split(".")[0].slice(0, 5);
}

export default function MisTicketsPage() {
  const [items, setItems] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TicketTab>("TODOS");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [history, setHistory] = useState<TicketAction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionText, setActionText] = useState("");
  const [supportUsers, setSupportUsers] = useState<SupportUser[]>([]);
  const [serviceTypes, setServiceTypes] = useState<CatalogItem[]>([]);
  const [gerencias, setGerencias] = useState<CatalogItem[]>([]);
  const [motivos, setMotivos] = useState<MotivoItem[]>([]);
  const [actionsModalOpen, setActionsModalOpen] = useState(false);
  const [reassignTicket, setReassignTicket] = useState<Ticket | null>(null);
  const [reassignStep, setReassignStep] = useState<ReassignStep>("select");
  const [reassignTarget, setReassignTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingHistory, setAddingHistory] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const loadedRef = useRef(false);
  const reduceMotion = useReducedMotion();

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("tipoRegistro", "SOPORTE");
    params.set("cola", "asignados");
    return params.toString();
  }, []);

  const visibleItems = useMemo(() => {
    if (activeTab === "TODOS") return items;
    return items.filter((item) => item.estado === activeTab);
  }, [activeTab, items]);

  const counts = useMemo(
    () => ({
      TODOS: items.length,
      EN_ATENCION: items.filter((item) => item.estado === "EN_ATENCION").length,
      RESPONDIDO: items.filter((item) => item.estado === "RESPONDIDO").length,
      RESUELTO: items.filter((item) => item.estado === "RESUELTO").length,
    }),
    [items]
  );

  const filteredMotivos = useMemo(() => {
    if (!selected || !edit) return [];
    const serviceType = serviceTypes.find((item) => item.name === selected.tipo_servicio);
    if (!serviceType) return [];
    return motivos.filter((item) => item.service_type_id === serviceType.id);
  }, [edit, motivos, selected, serviceTypes]);

  const resultsKey = `${activeTab}:${items.length}:${loading ? "loading" : "ready"}`;
  const avgResolutionTime =
    items.length === 0 ? 0 : Math.round(items.reduce((sum, item) => sum + (item.tiempo_minutos || 0), 0) / items.length);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/tickets?${queryString}`);
    if (!res.ok) {
      setError("No se pudieron cargar los tickets");
      setLoading(false);
      return;
    }
    const data = await res.json();
    const filtered = (data.items || []).filter((t: Ticket) => t.encargado !== "SIN_ASIGNAR");
    setItems(filtered);
    setLoading(false);
  }, [queryString]);

  async function loadSupportUsers() {
    const res = await fetch("/api/admin/support-users");
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    setSupportUsers(data?.items || []);
  }

  async function loadCatalogs() {
    const [tipoRes, gerRes, motRes] = await Promise.all([
      fetch("/api/catalogos/tiposervicio"),
      fetch("/api/catalogos/gerencia"),
      fetch("/api/catalogos/motivo"),
    ]);
    if (!tipoRes.ok || !gerRes.ok || !motRes.ok) {
      setError("No se pudieron cargar los catálogos del formulario");
      return;
    }
    const [tipoData, gerData, motData] = await Promise.all([tipoRes.json(), gerRes.json(), motRes.json()]);
    setServiceTypes(tipoData.items || []);
    setGerencias(gerData.items || []);
    setMotivos(motData.items || []);
  }

  async function loadHistory(ticketId: number) {
    setHistoryLoading(true);
    const res = await fetch(`/api/tickets/${ticketId}/acciones`);
    if (!res.ok) {
      setError("No se pudo cargar el histórico");
      setHistoryLoading(false);
      return;
    }
    const data = await res.json();
    setHistory(data.items || []);
    setHistoryLoading(false);
  }

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    async function loadInitialState() {
      await Promise.all([fetchTickets(), loadSupportUsers(), loadCatalogs()]);
    }
    void loadInitialState();
  }, [fetchTickets]);

  function closeSelectedDialog() {
    setSelected(null);
    setEdit(null);
    setHistory([]);
    setActionText("");
    setActionsModalOpen(false);
  }

  function openEdit(ticket: Ticket) {
    if (isResolvedTicket(ticket)) {
      toast.error(`El ticket #${ticket.id} ya fue resuelto y no puede volver a gestionarse.`);
      return;
    }
    setSelected(ticket);
    setEdit({
      gerencia: ticket.gerencia ?? "",
      motivo_servicio: ticket.motivo_servicio ?? "",
      accion_tomada: ticket.accion_tomada ?? "",
      fecha_respuesta: toDateValue(ticket.fecha_respuesta),
      hora_respuesta: toTimeValue(ticket.hora_respuesta),
      primer_contacto: Boolean(ticket.primer_contacto),
      estado: ticket.estado,
    });
    setActionText("");
    setActionsModalOpen(false);
    void loadHistory(ticket.id);
  }

  async function save() {
    if (!selected || !edit) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/tickets/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gerencia: edit.gerencia,
        motivoServicio: edit.motivo_servicio,
        accionTomada: edit.accion_tomada,
        primerContacto: edit.primer_contacto,
        status: edit.estado,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || "No se pudieron guardar los cambios");
      setSaving(false);
      return;
    }
    const data = await res.json().catch(() => null);
    if (data?.item) {
      const resolvedDate = toDateValue(data.item.fecha_respuesta);
      const resolvedTime = toTimeValue(data.item.hora_respuesta);
      setSelected((current) =>
        current
          ? {
              ...current,
              gerencia: edit.gerencia,
              motivo_servicio: edit.motivo_servicio,
              accion_tomada: edit.accion_tomada,
              fecha_respuesta: resolvedDate || current.fecha_respuesta,
              hora_respuesta: resolvedTime || current.hora_respuesta,
              primer_contacto: edit.primer_contacto,
              estado: data.item.estado,
              encargado: data.item.encargado,
              categoria: data.item.categoria ?? current.categoria,
              porcentaje: data.item.porcentaje ?? current.porcentaje,
              regla_porcentaje: data.item.regla_porcentaje ?? current.regla_porcentaje,
              tiempo_minutos: data.item.tiempo_minutos ?? current.tiempo_minutos,
            }
          : current
      );
      if (data.item.estado === "RESUELTO") {
        toast.success(
          `Ticket resuelto: #${selected.id} · ${formatDateTime(
            data.item.fecha_respuesta,
            data.item.hora_respuesta
          )}`
        );
      }
    }
    await fetchTickets();
    setSaving(false);
    closeSelectedDialog();
  }

  async function addHistoryAction() {
    if (!selected || !actionText.trim()) return;
    setAddingHistory(true);
    setError(null);
    const res = await fetch(`/api/tickets/${selected.id}/acciones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionText: actionText.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || "No se pudo registrar la acción");
      setAddingHistory(false);
      return;
    }
    setActionText("");
    await loadHistory(selected.id);
    setAddingHistory(false);
  }

  function openReassign(ticket: Ticket) {
    if (isResolvedTicket(ticket)) {
      toast.error(`El ticket #${ticket.id} ya fue resuelto y no admite reasignaciones.`);
      return;
    }
    setReassignTicket(ticket);
    setReassignStep("select");
    setReassignTarget("");
  }

  function closeReassign() {
    setReassignTicket(null);
    setReassignStep("select");
    setReassignTarget("");
  }

  async function reassign(ticketId: number, assignTo: string) {
    if (!assignTo) return;
    setReassigning(true);
    setError(null);
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reassign", assignTo }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || "No se pudo reasignar el ticket");
      setReassigning(false);
      return;
    }
    const data = await res.json().catch(() => null);
    if (data?.item && selected?.id === ticketId) {
      setSelected((current) =>
        current ? { ...current, encargado: data.item.encargado, estado: data.item.estado } : current
      );
    }
    if (reassignTicket?.id === ticketId) {
      setReassignStep("done");
    }
    void fetchTickets();
    setReassigning(false);
  }

  return (
    <main className="page">
      <section className="hero-panel hero-panel--compact">
        <div className="hero-panel__content">
          <div className="page-header">
            <span className="page-kicker">Gestión operativa</span>
            <h1 className="page-title">Mis tickets asignados</h1>
            <p className="page-copy">
              Atiende, documenta y cierra tickets desde un panel único. El detalle del ticket y los popups ahora separan
              claramente contexto, acción e historial para evitar pasos ambiguos.
            </p>
          </div>
          <div className="hero-panel__meta">
            <span className="topbar-chip topbar-chip--accent">
              <ClipboardList size={14} />
              {counts.TODOS} tickets en cartera
            </span>
            <span className="topbar-chip">
              <UserRound size={14} />
              {counts.EN_ATENCION} en atención activa
            </span>
            <span className="topbar-chip topbar-chip--warning">
              <History size={14} />
              {counts.RESPONDIDO} con respuesta pendiente de cierre
            </span>
            <span className="topbar-chip">
              SLA medio {avgResolutionTime} min
            </span>
          </div>
          <div className="metric-strip">
            <div className="metric">
              <span>En atención</span>
              <strong>{counts.EN_ATENCION}</strong>
            </div>
            <div className="metric">
              <span>Respondidos</span>
              <strong>{counts.RESPONDIDO}</strong>
            </div>
            <div className="metric">
              <span>Resueltos</span>
              <strong>{counts.RESUELTO}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="toolbar ticket-toolbar">
          <div className="stack ticket-toolbar__copy">
            <span className="page-kicker">Bandeja</span>
            <div>
              <h2 className="section-title">Prioriza por estado y entra al detalle cuando vayas a operar</h2>
              <p className="page-lead">
                Cada fila resume el contexto mínimo para decidir si documentas, cierras o reasignas.
              </p>
            </div>
          </div>
          <button className="button" onClick={fetchTickets} disabled={loading}>
            <RefreshCcw size={16} />
            {loading ? "Actualizando..." : "Actualizar bandeja"}
          </button>
        </div>
      </section>

      <section className="card">
        <motion.div
          className="tabs"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? {} : { opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <button className={`tab ${activeTab === "TODOS" ? "active" : ""}`} onClick={() => setActiveTab("TODOS")}>
            Todos ({counts.TODOS})
          </button>
          <button
            className={`tab ${activeTab === "EN_ATENCION" ? "active" : ""}`}
            onClick={() => setActiveTab("EN_ATENCION")}
          >
            En atención ({counts.EN_ATENCION})
          </button>
          <button
            className={`tab ${activeTab === "RESPONDIDO" ? "active" : ""}`}
            onClick={() => setActiveTab("RESPONDIDO")}
          >
            Respondidos ({counts.RESPONDIDO})
          </button>
          <button
            className={`tab ${activeTab === "RESUELTO" ? "active" : ""}`}
            onClick={() => setActiveTab("RESUELTO")}
          >
            Resueltos ({counts.RESUELTO})
          </button>
        </motion.div>
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
            {visibleItems.length === 0 ? (
              <div className="empty-state">
                <strong>No tienes tickets en este estado.</strong>
                <p className="muted">Cuando ingresen o cambien de estado, aparecerán aquí para que puedas gestionarlos.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Solicitante</th>
                      <th>Ruta</th>
                      <th>Seguimiento</th>
                      <th>Estado</th>
                      <th>SLA</th>
                      <th>Gestión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="table-cell-stack">
                            <strong className="table-primary">#{item.id}</strong>
                            <span className="table-secondary">{item.tipo_registro || "SOPORTE"}</span>
                          </div>
                        </td>
                        <td>
                          <div className="table-cell-stack">
                            <strong className="table-primary">{item.solicitante}</strong>
                            <span className="table-secondary line-clamp-2">{item.descripcion}</span>
                          </div>
                        </td>
                        <td>
                          <div className="table-cell-stack">
                            <strong className="table-primary">{item.tipo_servicio}</strong>
                            <span className="table-secondary">
                              {item.canal_oficina} · {item.gerencia}
                            </span>
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
                            <span className={statusTone(item.estado)}>{item.estado.replaceAll("_", " ")}</span>
                            <span className="table-secondary">{item.motivo_servicio}</span>
                          </div>
                        </td>
                        <td>
                          <div className="table-cell-stack">
                            <span className={slaTone(item.tiempo_minutos || 0)}>{item.tiempo_minutos || 0} min</span>
                            <span className="table-secondary">
                              {item.primer_contacto ? "Con primer contacto" : "Sin primer contacto"}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="table-actions">
                            {isResolvedTicket(item) ? (
                              <span className="status-chip status-chip--success">Ticket cerrado</span>
                            ) : (
                              <>
                                <button className="nav-link" type="button" onClick={() => openReassign(item)}>
                                  <Shuffle size={15} />
                                  Reasignar
                                </button>
                                <button className="button" type="button" onClick={() => openEdit(item)}>
                                  <ClipboardList size={15} />
                                  Gestionar
                                </button>
                              </>
                            )}
                          </div>
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

      <Dialog open={Boolean(selected && edit)} onOpenChange={(open) => (!open ? closeSelectedDialog() : undefined)}>
        {selected && edit ? (
          <DialogContent className="dialog-panel dialog-panel--wide">
            <DialogHeader className="dialog-panel__header">
              <div className="dialog-header__meta">
                <span className="page-kicker">Ticket #{selected.id}</span>
                <DialogTitle className="page-title dialog-title">{selected.tipo_servicio}</DialogTitle>
                <DialogDescription className="page-subtitle dialog-description">
                  {selected.solicitante} · {selected.canal_oficina} · Encargado actual: {selected.encargado}
                </DialogDescription>
              </div>
              <div className="dialog-header__chips">
                <span className={statusTone(edit.estado)}>{edit.estado.replaceAll("_", " ")}</span>
                <span className={slaTone(selected.tiempo_minutos || 0)}>{selected.tiempo_minutos || 0} min</span>
                <button className="nav-link dialog-close-action" type="button" onClick={closeSelectedDialog}>
                  <X size={15} />
                  Salir del ticket
                </button>
              </div>
            </DialogHeader>

            <form
              className="dialog-panel__shell"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="dialog-panel__body form">
                <div className="dialog-scroll-hint">
                  <span className="status-chip status-chip--info">
                    <ArrowDown size={14} />
                    Desliza para ver todo el formulario
                  </span>
                </div>
                <section className="form-section">
                  <div className="form-section__header">
                    <h3 className="form-section__title">Contexto operativo</h3>
                    <p className="form-section__copy">
                      Revisa primero el contexto base antes de modificar estado, cierre o datos del ticket.
                    </p>
                  </div>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="label">Solicitante</span>
                      <p>{selected.solicitante}</p>
                    </div>
                    <div className="detail-item">
                      <span className="label">Tipo de registro</span>
                      <p>{selected.tipo_registro || "SOPORTE"}</p>
                    </div>
                    <div className="detail-item">
                      <span className="label">Motivo actual</span>
                      <p>{selected.motivo_servicio}</p>
                    </div>
                    <div className="detail-item">
                      <span className="label">Reporte</span>
                      <p>{formatDateTime(selected.fecha_reporte, selected.hora_reporte)}</p>
                    </div>
                    <div className="detail-item">
                      <span className="label">Toma del ticket</span>
                      <p>{formatDateTime(selected.fecha_toma || undefined, selected.hora_toma || undefined)}</p>
                    </div>
                    <div className="detail-item detail-item--full">
                      <span className="label">Descripción</span>
                      <p className="detail-copy">{selected.descripcion}</p>
                    </div>
                  </div>
                </section>

                <section className="form-section">
                  <div className="form-section__header">
                    <h3 className="form-section__title">Actualizar gestión</h3>
                    <p className="form-section__copy">
                      Cambia estado, motivo y cierre desde una sola vista. La resolución se sella automáticamente cuando cierres el ticket.
                    </p>
                  </div>
                  <div className="split">
                    <label className="field">
                      <span className="label">Gerencia</span>
                      <select
                        className="select"
                        value={edit.gerencia}
                        onChange={(e) => setEdit({ ...edit, gerencia: e.target.value })}
                      >
                        <option value="">Seleccionar gerencia...</option>
                        {edit.gerencia && !gerencias.some((item) => item.name === edit.gerencia) ? (
                          <option value={edit.gerencia}>{edit.gerencia}</option>
                        ) : null}
                        {gerencias.map((item) => (
                          <option key={item.id} value={item.name}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">Estado</span>
                      <select
                        className="select"
                        value={edit.estado}
                        onChange={(e) => setEdit({ ...edit, estado: e.target.value })}
                      >
                        <option value="EN_ATENCION">En atención</option>
                        <option value="RESPONDIDO">Respondido</option>
                        <option value="RESUELTO">Resuelto</option>
                      </select>
                    </label>
                  </div>
                  <div className="split">
                    <label className="field">
                      <span className="label">Motivo</span>
                      <select
                        className="select"
                        value={edit.motivo_servicio}
                        onChange={(e) => setEdit({ ...edit, motivo_servicio: e.target.value })}
                      >
                        <option value="">Seleccionar motivo...</option>
                        {edit.motivo_servicio && !filteredMotivos.some((item) => item.name === edit.motivo_servicio) ? (
                          <option value={edit.motivo_servicio}>{edit.motivo_servicio}</option>
                        ) : null}
                        {filteredMotivos.map((item) => (
                          <option key={item.id} value={item.name}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">Primer contacto</span>
                      <select
                        className="select"
                        value={edit.primer_contacto ? "SI" : "NO"}
                        onChange={(e) => setEdit({ ...edit, primer_contacto: e.target.value === "SI" })}
                      >
                        <option value="NO">No</option>
                        <option value="SI">Sí</option>
                      </select>
                    </label>
                  </div>
                  <label className="field">
                    <span className="label">Acción tomada final</span>
                    <textarea
                      className="textarea"
                      value={edit.accion_tomada}
                      onChange={(e) => setEdit({ ...edit, accion_tomada: e.target.value })}
                      placeholder="Resume lo ejecutado, el resultado y el siguiente paso si aún no cierra."
                    />
                  </label>
                  <div className="split">
                  <label className="field">
                    <span className="label">Fecha de resolución</span>
                    <input
                      className="input input--readonly"
                      type="date"
                      value={edit.fecha_respuesta}
                      readOnly
                      disabled
                    />
                  </label>
                  <label className="field">
                    <span className="label">Hora de resolución</span>
                    <input
                      className="input input--readonly"
                      type="time"
                      value={edit.hora_respuesta}
                      readOnly
                      disabled
                    />
                  </label>
                </div>
                <p className="muted">
                  La fecha y la hora de resolución se generan automáticamente cuando el ticket se guarda con estado
                  <strong> RESUELTO</strong>.
                </p>
              </section>

                <section className="ticket-sidecar">
                  <div className="ticket-sidecar__copy">
                    <span className="page-kicker">Histórico</span>
                    <h3 className="section-title">Acciones del ticket</h3>
                    <p className="page-lead">
                      Abre el popup del histórico cuando necesites registrar seguimiento o revisar qué ya se hizo.
                    </p>
                  </div>
                  <button className="nav-link action-hover" type="button" onClick={() => setActionsModalOpen(true)}>
                    <History size={15} />
                    Abrir histórico operativo
                  </button>
                </section>
              </div>

              <div className="dialog-panel__footer dialog-panel__footer--sticky">
                <button className="nav-link" type="button" onClick={closeSelectedDialog}>
                  <X size={15} />
                  Salir
                </button>
                <button className="button" type="submit" disabled={saving}>
                  <Save size={15} />
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={Boolean(selected && actionsModalOpen)} onOpenChange={setActionsModalOpen}>
        {selected ? (
          <DialogContent className="dialog-panel dialog-panel--nested">
            <DialogHeader className="dialog-panel__header">
              <div className="dialog-header__meta">
                <span className="page-kicker">Ticket #{selected.id}</span>
                <DialogTitle className="section-title dialog-title">Histórico de acciones</DialogTitle>
                <DialogDescription className="page-subtitle dialog-description">
                  Registra cada intervención con suficiente contexto para que otro analista entienda el estado real.
                </DialogDescription>
              </div>
              <div className="dialog-header__chips">
                <button className="nav-link dialog-close-action" type="button" onClick={() => setActionsModalOpen(false)}>
                  <X size={15} />
                  Cerrar historial
                </button>
              </div>
            </DialogHeader>

            <div className="dialog-panel__shell">
              <div className="dialog-panel__body stack">
                <div className="dialog-scroll-hint">
                  <span className="status-chip status-chip--info">
                    <ArrowDown size={14} />
                    Desliza para revisar el histórico completo
                  </span>
                </div>
                <section className="form-section">
                  <label className="field">
                    <span className="label">Nueva acción</span>
                    <textarea
                      className="textarea"
                      value={actionText}
                      onChange={(e) => setActionText(e.target.value)}
                      placeholder="Ej. Se validó conectividad, se reinició el servicio y se notificó al solicitante."
                    />
                  </label>
                  <div className="dialog-inline-actions">
                    <button
                      className="button action-hover"
                      type="button"
                      onClick={() => void addHistoryAction()}
                      disabled={!actionText.trim() || addingHistory}
                    >
                      <Send size={15} />
                      {addingHistory ? "Registrando..." : "Registrar acción"}
                    </button>
                  </div>
                </section>

                <section className="form-section">
                  <div className="form-section__header">
                    <h3 className="form-section__title">Bitácora</h3>
                    <p className="form-section__copy">
                      El orden cronológico permite reconstruir la atención sin salir del popup.
                    </p>
                  </div>
                  {historyLoading ? (
                    <p className="muted">Cargando histórico...</p>
                  ) : history.length === 0 ? (
                    <div className="empty-state">
                      <strong>Sin acciones registradas.</strong>
                      <p className="muted">La primera acción debería describir qué se revisó y qué quedó pendiente.</p>
                    </div>
                  ) : (
                    <div className="timeline">
                      {history.map((item) => (
                        <article key={item.id} className="timeline-item">
                          <div className="timeline-item__meta">
                            <strong>{item.created_by_name}</strong>
                            <span>{formatDateTime(item.created_at)}</span>
                          </div>
                          <p className="detail-copy">{item.action_text}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div className="dialog-panel__footer dialog-panel__footer--sticky">
                <button className="nav-link" type="button" onClick={() => setActionsModalOpen(false)}>
                  <X size={15} />
                  Salir del historial
                </button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={Boolean(reassignTicket)} onOpenChange={(open) => (!open ? closeReassign() : undefined)}>
        {reassignTicket ? (
          <DialogContent className="dialog-panel dialog-panel--nested">
            <DialogHeader className="dialog-panel__header">
              <div className="dialog-header__meta">
                <span className="page-kicker">Reasignación</span>
                <DialogTitle className="section-title dialog-title">Ticket #{reassignTicket.id}</DialogTitle>
                <DialogDescription className="page-subtitle dialog-description">
                  Mueve el ticket solo cuando el siguiente responsable ya esté claro. Responsable actual:{" "}
                  {reassignTicket.encargado}.
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="dialog-panel__body stack">
              {reassignStep === "select" ? (
                <>
                  <section className="form-section">
                    <div className="form-section__header">
                      <h3 className="form-section__title">Selecciona al nuevo responsable</h3>
                      <p className="form-section__copy">
                        Solo se muestran otros usuarios de soporte para evitar una reasignación redundante.
                      </p>
                    </div>
                    <label className="field">
                      <span className="label">Reasignar a</span>
                      <select
                        className="select"
                        value={reassignTarget}
                        onChange={(e) => setReassignTarget(e.target.value)}
                      >
                        <option value="">Seleccionar...</option>
                        {supportUsers
                          .filter((user) => user.name !== reassignTicket.encargado)
                          .map((user) => (
                            <option key={user.id} value={user.name}>
                              {user.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </section>
                  <div className="dialog-panel__footer">
                    <button className="nav-link" type="button" onClick={closeReassign}>
                      Cancelar
                    </button>
                    <button
                      className="button"
                      type="button"
                      disabled={!reassignTarget}
                      onClick={() => setReassignStep("confirm")}
                    >
                      Continuar
                    </button>
                  </div>
                </>
              ) : null}

              {reassignStep === "confirm" ? (
                <>
                  <section className="form-section">
                    <div className="decision-banner">
                      <span className="status-chip status-chip--warning">Validación final</span>
                      <p>
                        El ticket <strong>#{reassignTicket.id}</strong> pasará de <strong>{reassignTicket.encargado}</strong>{" "}
                        a <strong>{reassignTarget}</strong>.
                      </p>
                    </div>
                  </section>
                  <div className="dialog-panel__footer">
                    <button className="nav-link" type="button" onClick={() => setReassignStep("select")}>
                      Volver
                    </button>
                    <button
                      className="button"
                      type="button"
                      onClick={() => void reassign(reassignTicket.id, reassignTarget)}
                      disabled={reassigning}
                    >
                      <Shuffle size={15} />
                      {reassigning ? "Reasignando..." : "Confirmar reasignación"}
                    </button>
                  </div>
                </>
              ) : null}

              {reassignStep === "done" ? (
                <>
                  <section className="form-section">
                    <div className="decision-banner decision-banner--success">
                      <span className="status-chip status-chip--success">Reasignado</span>
                      <p>
                        El ticket <strong>#{reassignTicket.id}</strong> ahora está asignado a <strong>{reassignTarget}</strong>.
                      </p>
                    </div>
                  </section>
                  <div className="dialog-panel__footer">
                    <button className="button" type="button" onClick={closeReassign}>
                      Cerrar
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </main>
  );
}
