"use client";

import { useState } from "react";

type ImportResponse = {
  ok: boolean;
  total: number;
  inserted: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
};

export default function ImportarPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  function downloadTemplate() {
    const headers = [
      "tipo_registro",
      "solicitante",
      "tipo_servicio",
      "canal_oficina",
      "gerencia",
      "motivo_servicio",
      "descripcion",
      "encargado",
      "fecha_reporte",
      "hora_reporte",
      "fecha_respuesta",
      "hora_respuesta",
      "accion_tomada",
      "primer_contacto",
      "estado",
    ];
    const sample = [
      "SOPORTE",
      "Juan Perez",
      "Soporte tecnico",
      "Central",
      "Operaciones",
      "SIN_MOTIVO",
      "No puedo acceder al sistema",
      "SIN_ASIGNAR",
      "25/02/2026",
      "08:30",
      "25/02/2026",
      "09:00",
      "PENDIENTE",
      "NO",
      "REGISTRADO",
    ];
    const csv = `${headers.join(",")}\n${sample.map((v) => `"${v}"`).join(",")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla_incidentes.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!file) {
      setError("Selecciona un archivo CSV (.csv)");
      return;
    }

    const form = new FormData();
    form.append("file", file);

    setLoading(true);
    const res = await fetch("/api/admin/import/incidents", {
      method: "POST",
      body: form,
    });
    const data = await res.json().catch(() => null);
    setLoading(false);

    if (!res.ok) {
      setError(data?.error || "No se pudo importar el archivo");
      return;
    }

    setResult(data as ImportResponse);
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1 className="page-title">Importar desde CSV</h1>
        <p className="page-subtitle">
          Carga masiva de incidentes/soporte a la base de datos desde un archivo CSV.
        </p>
      </header>

      <section className="card">
        <form className="form" onSubmit={onSubmit}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className="nav-link" type="button" onClick={downloadTemplate}>
              Descargar plantilla CSV
            </button>
          </div>
          <label className="field">
            <span className="label">Archivo CSV</span>
            <input
              className="input"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button className="button" type="submit" disabled={loading}>
            {loading ? "Importando..." : "Importar"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="page-title" style={{ fontSize: "1.2rem" }}>Columnas recomendadas</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          tipo_registro, solicitante, tipo_servicio, canal_oficina, gerencia, motivo_servicio,
          descripcion, encargado, fecha_reporte, hora_reporte, fecha_respuesta, hora_respuesta,
          accion_tomada, primer_contacto, estado.
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          Fechas: dd/mm/yyyy. Hora: HH:mm.
        </p>
      </section>

      {error && (
        <section className="card">
          <p className="error">{error}</p>
        </section>
      )}

      {result && (
        <section className="card">
          <h2 className="page-title" style={{ fontSize: "1.2rem" }}>Resultado</h2>
          <p className="muted" style={{ marginTop: 8 }}>
            Total: {result.total} | Insertados: {result.inserted} | Fallidos: {result.failed}
          </p>
          {result.errors.length > 0 && (
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((item, idx) => (
                    <tr key={`${item.row}-${idx}`}>
                      <td>{item.row}</td>
                      <td>{item.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
