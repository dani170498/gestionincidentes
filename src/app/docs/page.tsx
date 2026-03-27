"use client";

import { useEffect, useState } from "react";

type OpenApiSpec = {
  openapi: string;
  info?: { title?: string; version?: string; description?: string };
  servers?: Array<{ url: string }>;
  paths?: Record<string, unknown>;
};

export default function DocsPage() {
  const [spec, setSpec] = useState<OpenApiSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/docs/openapi");
      if (!res.ok) {
        setError("No se pudo cargar la especificacion OpenAPI.");
        setLoading(false);
        return;
      }
      const data = (await res.json().catch(() => null)) as OpenApiSpec | null;
      if (!data) {
        setError("Respuesta invalida en documentacion.");
        setLoading(false);
        return;
      }
      setSpec(data);
      setLoading(false);
    }
    void load();
  }, []);

  const baseUrl = spec?.servers?.[0]?.url || "";
  const soporteCurl = `curl -X POST ${baseUrl}/api/soporte/solicitud \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: TU_API_KEY" \\
  -d '{
    "solicitante":"Integracion ERP",
    "tipoServicio":"Soporte TI",
    "canalOficina":"Oficina Central",
    "descripcion":"No puedo acceder al sistema"
  }'`;

  const externalCurl = `curl -X POST ${baseUrl}/api/external/tickets \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: TU_API_KEY" \\
  -d '{
    "external_id":"EXT-2026-001",
    "tipo_registro":"SOPORTE",
    "solicitante":"Integracion ERP",
    "tipo_servicio":1,
    "canal_oficina":1,
    "gerencia":1,
    "motivo_servicio":2,
    "descripcion":"Error al registrar orden",
    "encargado":"SIN_ASIGNAR",
    "fecha_reporte":"2026-03-27",
    "hora_reporte":"09:30",
    "fecha_respuesta":"2026-03-27",
    "hora_respuesta":"10:15",
    "accion_tomada":"Escalado a mesa de ayuda",
    "primer_contacto":false
  }'`;

  return (
    <main className="page">
      <header className="page-header">
        <h1 className="page-title">Documentacion API</h1>
        <p className="page-subtitle">Referencia para integraciones POST hacia el sistema.</p>
      </header>

      <section className="card">
        {loading && <p className="muted">Cargando especificacion...</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && spec && (
          <div className="form">
            <p className="muted">
              <strong>{spec.info?.title || "API"}</strong> v{spec.info?.version || "-"}
            </p>
            <p className="muted">OpenAPI: {spec.openapi}</p>
            <p className="muted">Base URL: {baseUrl || "-"}</p>
            <p className="muted">
              Spec JSON: <a className="nav-link" href="/api/docs/openapi" target="_blank" rel="noreferrer">/api/docs/openapi</a>
            </p>
            <p className="muted">Endpoints documentados: {Object.keys(spec.paths || {}).length}</p>
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="page-title" style={{ fontSize: "1.2rem" }}>Ejemplo: Solicitud Soporte</h2>
        <pre className="input" style={{ whiteSpace: "pre-wrap" }}>{soporteCurl}</pre>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="page-title" style={{ fontSize: "1.2rem" }}>Ejemplo: Ticket Externo</h2>
        <pre className="input" style={{ whiteSpace: "pre-wrap" }}>{externalCurl}</pre>
      </section>
    </main>
  );
}
