"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Ticket = {
  id: number;
  tipo_registro?: string;
  solicitante: string;
  tipo_servicio: string;
  canal_oficina: string;
  gerencia: string;
  descripcion: string;
  encargado: string;
  fecha_reporte: string;
  hora_reporte: string;
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
type TicketTab = "TODOS" | "EN_ATENCION" | "RESPONDIDO" | "RESUELTO";
type ReassignStep = "select" | "confirm" | "done";

type EditState = {
  accion_tomada: string;
  fecha_respuesta: string;
  hora_respuesta: string;
  primer_contacto: boolean;
  estado: string;
};

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
  const [actionsModalOpen, setActionsModalOpen] = useState(false);
  const [reassignTicket, setReassignTicket] = useState<Ticket | null>(null);
  const [reassignStep, setReassignStep] = useState<ReassignStep>("select");
  const [reassignTarget, setReassignTarget] = useState("");
  const loadedRef = useRef(false);

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

  async function fetchTickets() {
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
  }

  async function loadSupportUsers() {
    const res = await fetch("/api/admin/support-users");
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    setSupportUsers(data?.items || []);
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
    void fetchTickets();
    void loadSupportUsers();
  }, []);

  function openEdit(ticket: Ticket) {
    setSelected(ticket);
    setEdit({
      accion_tomada: ticket.accion_tomada ?? "",
      fecha_respuesta: ticket.fecha_respuesta?.slice(0, 10) || "",
      hora_respuesta: ticket.hora_respuesta?.slice(0, 5) || "",
      primer_contacto: Boolean(ticket.primer_contacto),
      estado: ticket.estado,
    });
    setActionText("");
    setActionsModalOpen(false);
    void loadHistory(ticket.id);
  }

  async function save() {
    if (!selected || !edit) return;
    const res = await fetch(`/api/tickets/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accionTomada: edit.accion_tomada,
        fechaRespuesta: edit.estado === "RESUELTO" ? edit.fecha_respuesta : undefined,
        horaRespuesta: edit.estado === "RESUELTO" ? edit.hora_respuesta : undefined,
        primerContacto: edit.primer_contacto,
        status: edit.estado,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || "No se pudieron guardar los cambios");
      return;
    }
    void fetchTickets();
    setSelected(null);
    setEdit(null);
    setHistory([]);
    setActionsModalOpen(false);
  }

  async function addHistoryAction() {
    if (!selected || !actionText.trim()) return;
    const res = await fetch(`/api/tickets/${selected.id}/acciones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionText: actionText.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || "No se pudo registrar la acción");
      return;
    }
    setActionText("");
    await loadHistory(selected.id);
  }

  function openReassign(ticket: Ticket) {
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
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reassign", assignTo }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || "No se pudo reasignar el ticket");
      return;
    }
    const data = await res.json().catch(() => null);
    if (data?.item && selected?.id === ticketId) {
      setSelected({ ...selected, encargado: data.item.encargado, estado: data.item.estado });
    }
    if (reassignTicket?.id === ticketId) {
      setReassignStep("done");
    }
    void fetchTickets();
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1 className="page-title">Mis Tickets</h1>
        <p className="page-subtitle">Aquí se gestionan estados, acciones históricas, reasignación y cierre.</p>
      </header>

      <section className="card">
        <div style={{ display: "flex", gap: 12 }}>
          <button className="button" onClick={fetchTickets} disabled={loading}>
            {loading ? "Cargando..." : "Actualizar"}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="tabs">
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
        </div>
      </section>

      <section className="card">
        {error && <p className="error">{error}</p>}
        {visibleItems.length === 0 ? (
          <p className="muted">Sin tickets asignados.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tipo</th>
                  <th>Solicitante</th>
                  <th>Tipo servicio</th>
                  <th>Canal</th>
                  <th>Gerencia</th>
                  <th>Estado</th>
                  <th>Reasignar</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.tipo_registro || "SOPORTE"}</td>
                    <td>{item.solicitante}</td>
                    <td>{item.tipo_servicio}</td>
                    <td>{item.canal_oficina}</td>
                    <td>{item.gerencia}</td>
                    <td>{item.estado}</td>
                    <td>
                      <button className="nav-link" onClick={() => openReassign(item)}>
                        Reasignar
                      </button>
                    </td>
                    <td>
                      <button className="nav-link" onClick={() => openEdit(item)}>
                        Gestionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && edit && (
          <div className="modal-backdrop">
          <div className="modal modal--wide">
            <h2 className="page-title" style={{ fontSize: "1.4rem" }}>
              Ticket #{selected.id}
            </h2>
            <p className="page-subtitle" style={{ marginTop: 4 }}>
              {selected.solicitante} | {selected.tipo_servicio} | Encargado: {selected.encargado}
            </p>

            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label className="field">
                <span className="label">Descripción</span>
                <textarea className="textarea input--readonly" value={selected.descripcion} readOnly />
              </label>
              <div className="split">
                <label className="field">
                  <span className="label">Tipo de registro</span>
                  <input className="input input--readonly" value={selected.tipo_registro || "SOPORTE"} readOnly />
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
              <label className="field">
                <span className="label">Acción tomada final</span>
                <textarea
                  className="textarea"
                  value={edit.accion_tomada}
                  onChange={(e) => setEdit({ ...edit, accion_tomada: e.target.value })}
                />
              </label>
              <div className="split">
                <label className="field">
                  <span className="label">Fecha de respuesta</span>
                  <input
                    className="input"
                    type="date"
                    value={edit.fecha_respuesta}
                    onChange={(e) => setEdit({ ...edit, fecha_respuesta: e.target.value })}
                    disabled={edit.estado !== "RESUELTO"}
                  />
                </label>
                <label className="field">
                  <span className="label">Hora de respuesta</span>
                  <input
                    className="input"
                    type="time"
                    value={edit.hora_respuesta}
                    onChange={(e) => setEdit({ ...edit, hora_respuesta: e.target.value })}
                    disabled={edit.estado !== "RESUELTO"}
                  />
                </label>
              </div>
              <div className="split">
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

              <section className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <h3 style={{ fontSize: "1.05rem" }}>Acciones del ticket</h3>
                  <button className="nav-link" type="button" onClick={() => setActionsModalOpen(true)}>
                    Gestionar acciones
                  </button>
                </div>
                <p className="muted" style={{ marginTop: 8 }}>
                  Registra el histórico operativo del ticket en un popup dedicado.
                </p>
              </section>

              <div style={{ display: "flex", gap: 12 }}>
                <button className="button" type="submit">
                  Guardar cambios
                </button>
                <button
                  className="nav-link"
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setEdit(null);
                    setHistory([]);
                    setActionText("");
                    setActionsModalOpen(false);
                  }}
                >
                  Salir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selected && actionsModalOpen && (
        <div className="modal-backdrop">
          <div className="modal modal--nested">
            <h2 className="page-title" style={{ fontSize: "1.3rem" }}>
              Acciones del Ticket #{selected.id}
            </h2>
            <p className="page-subtitle" style={{ marginTop: 4 }}>
              Registra y consulta el histórico de acciones de atención.
            </p>

            <section className="card" style={{ marginTop: 12 }}>
              <label className="field">
                <span className="label">Nueva acción</span>
                <textarea
                  className="textarea"
                  value={actionText}
                  onChange={(e) => setActionText(e.target.value)}
                  placeholder="Registra una acción realizada durante la atención..."
                />
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="button" type="button" onClick={() => void addHistoryAction()}>
                  Agregar acción
                </button>
              </div>
            </section>

            <section className="card" style={{ marginTop: 12 }}>
              <h3 style={{ fontSize: "1.05rem" }}>Histórico</h3>
              {historyLoading ? (
                <p className="muted" style={{ marginTop: 12 }}>Cargando histórico...</p>
              ) : history.length === 0 ? (
                <p className="muted" style={{ marginTop: 12 }}>Sin acciones registradas.</p>
              ) : (
                <div style={{ marginTop: 12, display: "grid", gap: 8, maxHeight: "48vh", overflowY: "auto" }}>
                  {history.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: 10,
                        background: "var(--surface-2)",
                      }}
                    >
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        {new Date(item.created_at).toLocaleString()} - {item.created_by_name}
                      </div>
                      <div style={{ marginTop: 4 }}>{item.action_text}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <button className="nav-link" type="button" onClick={() => setActionsModalOpen(false)}>
                Atrás
              </button>
              <button
                className="nav-link"
                type="button"
                onClick={() => {
                  setActionsModalOpen(false);
                  setSelected(null);
                  setEdit(null);
                  setHistory([]);
                  setActionText("");
                }}
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      )}

      {reassignTicket && (
        <div className="modal-backdrop modal-backdrop--animated">
          <div className="modal modal--nested modal--animated">
            <h2 className="page-title" style={{ fontSize: "1.3rem" }}>
              Reasignar Ticket #{reassignTicket.id}
            </h2>
            <p className="page-subtitle" style={{ marginTop: 4 }}>
              Ticket asignado actualmente a {reassignTicket.encargado}.
            </p>

            {reassignStep === "select" && (
              <>
                <section className="card" style={{ marginTop: 12 }}>
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
                <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                  <button className="nav-link" type="button" onClick={closeReassign}>
                    Atrás
                  </button>
                  <button
                    className="button"
                    type="button"
                    disabled={!reassignTarget}
                    onClick={() => setReassignStep("confirm")}
                  >
                    Continuar
                  </button>
                  <button className="nav-link" type="button" onClick={closeReassign}>
                    Salir
                  </button>
                </div>
              </>
            )}

            {reassignStep === "confirm" && (
              <>
                <section className="card" style={{ marginTop: 12 }}>
                  <p>
                    Estas seguro de reasignar el ticket <strong>#{reassignTicket.id}</strong> a{" "}
                    <strong>{reassignTarget}</strong>?
                  </p>
                </section>
                <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                  <button className="nav-link" type="button" onClick={() => setReassignStep("select")}>
                    Atrás
                  </button>
                  <button className="button" type="button" onClick={() => void reassign(reassignTicket.id, reassignTarget)}>
                    Confirmar reasignación
                  </button>
                  <button className="nav-link" type="button" onClick={closeReassign}>
                    Salir
                  </button>
                </div>
              </>
            )}

            {reassignStep === "done" && (
              <>
                <section className="card" style={{ marginTop: 12 }}>
                  <p>
                    Ticket <strong>#{reassignTicket.id}</strong> reasignado correctamente a{" "}
                    <strong>{reassignTarget}</strong>.
                  </p>
                </section>
                <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                  <button className="nav-link" type="button" onClick={() => setReassignStep("confirm")}>
                    Atrás
                  </button>
                  <button className="nav-link" type="button" onClick={closeReassign}>
                    Salir
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
