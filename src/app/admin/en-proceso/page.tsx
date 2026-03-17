"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Ticket = {
  id: number;
  tipo_registro: string;
  solicitante: string;
  tipo_servicio: string;
  canal_oficina: string;
  gerencia: string;
  motivo_servicio: string;
  descripcion: string;
  encargado: string;
  tiempo_minutos: number;
  estado: string;
};

type CatalogItem = { id: number; name: string; active: boolean };

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

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    async function loadCatalogs() {
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
    }
    void loadCatalogs();
  }, []);

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
    const res = await fetch(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "take" }),
    });
    if (!res.ok) {
      setError("No se pudo tomar el ticket");
      return;
    }
    void fetchTickets();
  }

  useEffect(() => {
    void fetchTickets();
  }, []);

  return (
    <main className="page">
      <header className="page-header">
        <h1 className="page-title">Tickets por Resolver</h1>
        <p className="page-subtitle">Esta cola solo muestra tickets sin asignar. Desde aquí solo se toman.</p>
      </header>

      <section className="card">
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
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button className="button" onClick={fetchTickets} disabled={loading}>
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
            }}
          >
            Limpiar
          </button>
        </div>
      </section>

      <section className="card">
        {error && <p className="error">{error}</p>}
        {items.length === 0 ? (
          <p className="muted">No hay tickets sin asignar con esos filtros.</p>
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
                  <th>Motivo</th>
                  <th>Descripción</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.tipo_registro}</td>
                    <td>{item.solicitante}</td>
                    <td>{item.tipo_servicio}</td>
                    <td>{item.canal_oficina}</td>
                    <td>{item.gerencia}</td>
                    <td>{item.motivo_servicio}</td>
                    <td style={{ maxWidth: 320 }}>{item.descripcion}</td>
                    <td>{item.estado}</td>
                    <td>
                      <button className="button" onClick={() => void takeTicket(item.id)}>
                        Tomar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

