import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { authCookieName, verifyJwt } from "@/lib/auth";

type RawRow = Record<string, unknown>;

type ParsedRow = {
  tipoRegistro: "INCIDENTE" | "SOPORTE";
  solicitante: string;
  tipoServicio: string;
  canalOficina: string;
  gerencia: string;
  motivoServicio: string;
  descripcion: string;
  encargado: string;
  fechaReporte: string;
  horaReporte: string;
  fechaRespuesta: string;
  horaRespuesta: string;
  accionTomada: string;
  primerContacto: boolean;
  estado: "REGISTRADO" | "EN_ATENCION" | "RESPONDIDO" | "RESUELTO";
};

function splitCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function parseCsv(text: string): RawRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const rawHeaders = splitCsvLine(lines[0], delimiter);
  const headers = rawHeaders.map((h) => normalizeHeader(h));

  const rows: RawRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i], delimiter);
    const row: RawRow = {};
    for (let c = 0; c < headers.length; c += 1) {
      row[headers[c]] = cols[c] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseBool(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "si" || v === "sí" || v === "true" || v === "1" || v === "yes";
}

function normalizeDateString(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  // Preferred import format: dd/mm/yyyy
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const day = slash[1].padStart(2, "0");
    const month = slash[2].padStart(2, "0");
    const year = slash[3];
    if (Number(day) < 1 || Number(day) > 31 || Number(month) < 1 || Number(month) > 12) return null;
    return `${year}-${month}-${day}`;
  }

  // Compatibility: allow yyyy-mm-dd from other modules and convert to internal format.
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = iso[1];
    const month = iso[2];
    const day = iso[3];
    if (Number(day) < 1 || Number(day) > 31 || Number(month) < 1 || Number(month) > 12) return null;
    return `${year}-${month}-${day}`;
  }

  return null;
}

function normalizeTimeString(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const match = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hh = String(Number(match[1])).padStart(2, "0");
  const mm = match[2];
  if (Number(hh) > 23 || Number(mm) > 59) return null;
  return `${hh}:${mm}`;
}

function monthFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function categoriaPorTiempo(minutes: number): string {
  if (minutes < 60) return "Menos de 1 hora";
  if (minutes < 120) return "1 - 2 horas";
  if (minutes < 240) return "2 - 4 horas";
  return "Más de 4 horas";
}

function porcentajePorTiempo(minutes: number): { porcentaje: number; regla: string } {
  if (minutes < 60) return { porcentaje: 100, regla: "< 1 hora = 100%" };
  if (minutes < 120) return { porcentaje: 75, regla: "1 - 2 horas = 75%" };
  if (minutes < 240) return { porcentaje: 50, regla: "2 - 4 horas = 50%" };
  return { porcentaje: 25, regla: "> 4 horas = 25%" };
}

function getByAlias(row: RawRow, aliases: string[]): string {
  for (const key of aliases) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return readString(value);
    }
  }
  return "";
}

function parseRow(row: RawRow): { ok: true; value: ParsedRow } | { ok: false; error: string } {
  const tipoRegistroRaw = getByAlias(row, ["tipo_registro", "tiporegistro", "tipo"]);
  const tipoRegistro = tipoRegistroRaw.toUpperCase() === "SOPORTE" ? "SOPORTE" : "INCIDENTE";

  const solicitante = getByAlias(row, ["solicitante", "usuario_solicitante", "usuario"]);
  const tipoServicio = getByAlias(row, ["tipo_servicio", "tiposervicio"]);
  const canalOficina = getByAlias(row, ["canal_oficina", "canal", "oficina"]);
  const gerencia = getByAlias(row, ["gerencia"]);
  const motivoServicio = getByAlias(row, ["motivo_servicio", "motivo"]) || "SIN_MOTIVO";
  const descripcion = getByAlias(row, ["descripcion", "descripcion_problema", "detalle"]);
  const encargado = getByAlias(row, ["encargado"]) || "SIN_ASIGNAR";
  const accionTomada = getByAlias(row, ["accion_tomada", "accion"]) || "PENDIENTE";

  if (!solicitante || !tipoServicio || !canalOficina || !gerencia || !descripcion) {
    return {
      ok: false,
      error: "Faltan campos requeridos: solicitante, tipo_servicio, canal_oficina, gerencia, descripcion",
    };
  }

  const fechaReporteRaw = getByAlias(row, ["fecha_reporte", "fechareporte"]);
  const horaReporteRaw = getByAlias(row, ["hora_reporte", "horareporte"]);
  const fechaRespuestaRaw = getByAlias(row, ["fecha_respuesta", "fecharespuesta"]) || fechaReporteRaw;
  const horaRespuestaRaw = getByAlias(row, ["hora_respuesta", "horarespuesta"]) || horaReporteRaw;

  const fechaReporte = normalizeDateString(fechaReporteRaw);
  const horaReporte = normalizeTimeString(horaReporteRaw);
  const fechaRespuesta = normalizeDateString(fechaRespuestaRaw);
  const horaRespuesta = normalizeTimeString(horaRespuestaRaw);

  if (!fechaReporte || !horaReporte || !fechaRespuesta || !horaRespuesta) {
    return { ok: false, error: "Fecha/hora inválida. Usa formato dd/mm/yyyy y HH:mm" };
  }

  const start = new Date(`${fechaReporte}T${horaReporte}`);
  const end = new Date(`${fechaRespuesta}T${horaRespuesta}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) {
    return { ok: false, error: "La fecha/hora de respuesta no puede ser anterior al reporte" };
  }

  const primerContacto = parseBool(getByAlias(row, ["primer_contacto", "primercontacto"]));
  const estadoRaw = getByAlias(row, ["estado"]).toUpperCase();
  const estado =
    estadoRaw === "REGISTRADO" ||
    estadoRaw === "EN_ATENCION" ||
    estadoRaw === "RESPONDIDO" ||
    estadoRaw === "RESUELTO"
      ? estadoRaw
      : "REGISTRADO";

  return {
    ok: true,
    value: {
      tipoRegistro,
      solicitante,
      tipoServicio,
      canalOficina,
      gerencia,
      motivoServicio,
      descripcion,
      encargado,
      fechaReporte,
      horaReporte,
      fechaRespuesta,
      horaRespuesta,
      accionTomada,
      primerContacto,
      estado,
    },
  };
}

async function requireAdmin() {
  const jar = await cookies();
  const token = jar.get(authCookieName)?.value;
  const payload = token ? verifyJwt(token) : null;
  const roles = payload?.roles && payload.roles.length ? payload.roles : payload?.role ? [payload.role] : [];
  if (!payload || !roles.includes("ADMIN")) return null;
  return payload;
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido (campo file)" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "Solo se permite archivo .csv" }, { status: 400 });
  }

  const csvText = await file.text();
  const normalizedRows = parseCsv(csvText);
  if (normalizedRows.length === 0) {
    return NextResponse.json({ error: "El archivo CSV no contiene filas" }, { status: 400 });
  }

  let inserted = 0;
  const errors: Array<{ row: number; error: string }> = [];

  for (let i = 0; i < normalizedRows.length; i += 1) {
    const parsed = parseRow(normalizedRows[i]);
    if (!parsed.ok) {
      errors.push({ row: i + 2, error: parsed.error });
      continue;
    }

    const item = parsed.value;
    const start = new Date(`${item.fechaReporte}T${item.horaReporte}`);
    const end = new Date(`${item.fechaRespuesta}T${item.horaRespuesta}`);
    const diffMinutes = Math.floor((end.getTime() - start.getTime()) / 60000);
    const categoria = categoriaPorTiempo(diffMinutes);
    const { porcentaje, regla } = porcentajePorTiempo(diffMinutes);
    const mesAtencion = monthFromDate(end);

    try {
      await db.query(
        `INSERT INTO incidents (
          tipo_registro,
          solicitante,
          tipo_servicio,
          canal_oficina,
          gerencia,
          motivo_servicio,
          descripcion,
          encargado,
          fecha_reporte,
          hora_reporte,
          fecha_respuesta,
          hora_respuesta,
          accion_tomada,
          primer_contacto,
          tiempo_minutos,
          mes_atencion,
          categoria,
          porcentaje,
          regla_porcentaje,
          estado,
          created_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now()
        )`,
        [
          item.tipoRegistro,
          item.solicitante,
          item.tipoServicio,
          item.canalOficina,
          item.gerencia,
          item.motivoServicio,
          item.descripcion,
          item.encargado,
          item.fechaReporte,
          item.horaReporte,
          item.fechaRespuesta,
          item.horaRespuesta,
          item.accionTomada,
          item.primerContacto,
          diffMinutes,
          mesAtencion,
          categoria,
          porcentaje,
          regla,
          item.estado,
        ]
      );
      inserted += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error insertando fila";
      errors.push({ row: i + 2, error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    total: normalizedRows.length,
    inserted,
    failed: errors.length,
    errors: errors.slice(0, 50),
  });
}
