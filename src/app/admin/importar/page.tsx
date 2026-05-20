"use client";

import { useState } from "react";
import { toast } from "sonner";

type ImportResponse = {
  ok: boolean;
  total: number;
  inserted: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
  message?: string;
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
      "fecha_toma",
      "hora_toma",
      "fecha_resolucion",
      "hora_resolucion",
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
      "",
      "",
      "25/02/2026",
      "09:00",
      "Se resolvió el acceso y se confirmó con el usuario",
      "SI",
      "RESUELTO",
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
      const message = "Selecciona un archivo CSV o Excel";
      setError(message);
      toast.error(message);
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
      const message = data?.message || data?.error || "No se pudo importar el archivo";
      setError(message);
      setResult(data as ImportResponse | null);
      toast.error(message);
      return;
    }

    const response = data as ImportResponse;
    setResult(response);

    if (response.failed > 0) {
      toast.warning(response.message || "La importación terminó con observaciones");
      return;
    }

    toast.success(response.message || "Importación completada correctamente");
  }

  return (
    <main className="page">
      <section className="card">
        <form className="form" onSubmit={onSubmit}>
          <div className="actions-row">
            <button className="nav-link" type="button" onClick={downloadTemplate}>
              Descargar plantilla CSV
            </button>
          </div>
          <label className="field">
            <span className="label">Archivo CSV o Excel</span>
            <input
              className="input"
              type="file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button className="button" type="submit" disabled={loading}>
            {loading ? "Importando..." : "Importar"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="section-title">Columnas recomendadas</h2>
        <p className="muted">
          tipo_registro, solicitante, tipo_servicio, canal_oficina, gerencia, motivo_servicio,
          descripcion, encargado, fecha_reporte, hora_reporte, fecha_toma, hora_toma, fecha_resolucion, hora_resolucion,
          accion_tomada, primer_contacto, estado.
        </p>
        <p className="muted">
          Formatos permitidos: CSV, XLSX y XLS. Fechas: dd/mm/yyyy. Hora: HH:mm.
        </p>
        <p className="muted">
          tipo_servicio, canal_oficina, gerencia y motivo_servicio deben existir en los catálogos activos.
        </p>
      </section>

      {error && (
        <section className="card">
          <p className="error">{error}</p>
        </section>
      )}

      {result && (
        <section className="card">
          <h2 className="section-title">Resultado</h2>
          {result.message && <p className="muted">{result.message}</p>}
          <p className="muted">
            Total: {result.total} | Insertados: {result.inserted} | Fallidos: {result.failed}
          </p>
          {result.errors.length > 0 && (
            <div className="table-wrap">
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
