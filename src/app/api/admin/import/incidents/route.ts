import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { authCookieName, getJwtRoles, verifyJwt } from "@/lib/auth";

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
  fechaToma: string | null;
  horaToma: string | null;
  fechaRespuesta: string | null;
  horaRespuesta: string | null;
  accionTomada: string | null;
  primerContacto: boolean;
  estado: "REGISTRADO" | "EN_ATENCION" | "RESPONDIDO" | "RESUELTO";
};

type CatalogValue = {
  id: number;
  name: string;
};

type MotivoCatalogValue = CatalogValue & {
  serviceTypeId: number;
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

function rowsFromMatrix(matrix: unknown[][]): RawRow[] {
  const normalizedMatrix = matrix
    .filter((row) => row.some((cell) => readString(cell).length > 0))
    .map((row) => row.map((cell) => readString(cell)));

  if (normalizedMatrix.length === 0) return [];

  const headers = normalizedMatrix[0].map((header) => normalizeHeader(header));
  const rows: RawRow[] = [];

  for (let i = 1; i < normalizedMatrix.length; i += 1) {
    const cols = normalizedMatrix[i];
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

async function loadCatalogMap(table: string): Promise<Map<string, CatalogValue>> {
  const result = await db.query(`SELECT id, name FROM ${table} WHERE active = true`);
  const map = new Map<string, CatalogValue>();
  for (const row of result.rows as CatalogValue[]) {
    map.set(normalizeHeader(row.name), row);
  }
  return map;
}

function findCatalogValue<T extends CatalogValue>(
  value: string,
  catalog: Map<string, T>,
  label: string
): { ok: true; value: T } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: `${label} es requerido` };
  }

  if (/^\d+$/.test(trimmed)) {
    const numericId = Number(trimmed);
    for (const item of catalog.values()) {
      if (item.id === numericId) return { ok: true, value: item };
    }
    return { ok: false, error: `${label} no encontrado` };
  }

  const found = catalog.get(normalizeHeader(trimmed));
  if (!found) {
    return { ok: false, error: `${label} no encontrado: ${trimmed}` };
  }

  return { ok: true, value: found };
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

async function parseSpreadsheet(file: File): Promise<RawRow[]> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".csv")) {
    return parseCsv(await file.text());
  }

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
    });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const sheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      dateNF: "dd/mm/yyyy",
    });
    return rowsFromMatrix(matrix);
  }

  throw new Error("Formato no soportado");
}

function parseRow(
  row: RawRow,
  catalogs: {
    tiposServicio: Map<string, CatalogValue>;
    canales: Map<string, CatalogValue>;
    gerencias: Map<string, CatalogValue>;
    motivos: Map<string, MotivoCatalogValue>;
  }
): { ok: true; value: ParsedRow } | { ok: false; error: string } {
  const tipoRegistroRaw = getByAlias(row, ["tipo_registro", "tiporegistro", "tipo"]);
  const tipoRegistro = tipoRegistroRaw.toUpperCase() === "SOPORTE" ? "SOPORTE" : "INCIDENTE";

  const solicitante = getByAlias(row, ["solicitante", "usuario_solicitante", "usuario"]);
  const tipoServicioRaw = getByAlias(row, ["tipo_servicio", "tiposervicio"]);
  const canalOficinaRaw = getByAlias(row, ["canal_oficina", "canal", "oficina"]);
  const gerenciaRaw = getByAlias(row, ["gerencia"]);
  const motivoServicioRaw = getByAlias(row, ["motivo_servicio", "motivo"]) || "SIN_MOTIVO";
  const descripcion = getByAlias(row, ["descripcion", "descripcion_problema", "detalle"]);
  const encargado = getByAlias(row, ["encargado"]) || "SIN_ASIGNAR";
  const accionTomada = getByAlias(row, ["accion_tomada", "accion"]) || null;

  if (!solicitante || !tipoServicioRaw || !canalOficinaRaw || !gerenciaRaw || !descripcion) {
    return {
      ok: false,
      error: "Faltan campos requeridos: solicitante, tipo_servicio, canal_oficina, gerencia, descripcion",
    };
  }

  const tipoServicioResolved = findCatalogValue(tipoServicioRaw, catalogs.tiposServicio, "tipo_servicio");
  if (!tipoServicioResolved.ok) return tipoServicioResolved;

  const canalOficinaResolved = findCatalogValue(canalOficinaRaw, catalogs.canales, "canal_oficina");
  if (!canalOficinaResolved.ok) return canalOficinaResolved;

  const gerenciaResolved = findCatalogValue(gerenciaRaw, catalogs.gerencias, "gerencia");
  if (!gerenciaResolved.ok) return gerenciaResolved;

  const motivoServicioResolved = findCatalogValue(motivoServicioRaw, catalogs.motivos, "motivo_servicio");
  if (!motivoServicioResolved.ok) return motivoServicioResolved;

  if (motivoServicioResolved.value.serviceTypeId !== tipoServicioResolved.value.id) {
    return { ok: false, error: "motivo_servicio no corresponde al tipo_servicio" };
  }

  const fechaReporteRaw = getByAlias(row, ["fecha_reporte", "fechareporte"]);
  const horaReporteRaw = getByAlias(row, ["hora_reporte", "horareporte"]);
  const fechaTomaRaw = getByAlias(row, ["fecha_toma", "fechatoma"]);
  const horaTomaRaw = getByAlias(row, ["hora_toma", "horatoma"]);
  const fechaRespuestaRaw =
    getByAlias(row, ["fecha_resolucion", "fecharesolucion", "fecha_respuesta", "fecharespuesta"]) || null;
  const horaRespuestaRaw =
    getByAlias(row, ["hora_resolucion", "horaresolucion", "hora_respuesta", "horarespuesta"]) || null;

  const fechaReporte = normalizeDateString(fechaReporteRaw);
  const horaReporte = normalizeTimeString(horaReporteRaw);
  const fechaToma = fechaTomaRaw ? normalizeDateString(fechaTomaRaw) : null;
  const horaToma = horaTomaRaw ? normalizeTimeString(horaTomaRaw) : null;
  const fechaRespuesta = fechaRespuestaRaw ? normalizeDateString(fechaRespuestaRaw) : null;
  const horaRespuesta = horaRespuestaRaw ? normalizeTimeString(horaRespuestaRaw) : null;

  if (!fechaReporte || !horaReporte) {
    return { ok: false, error: "Fecha/hora inválida. Usa formato dd/mm/yyyy y HH:mm" };
  }

  const start = new Date(`${fechaReporte}T${horaReporte}`);
  if (Number.isNaN(start.getTime())) {
    return { ok: false, error: "La fecha/hora de reporte no es válida" };
  }

  if ((fechaToma && !horaToma) || (horaToma && !fechaToma)) {
    return { ok: false, error: "La toma del ticket debe definir fecha y hora juntas" };
  }

  if ((fechaRespuesta && !horaRespuesta) || (horaRespuesta && !fechaRespuesta)) {
    return { ok: false, error: "La resolución del ticket debe definir fecha y hora juntas" };
  }

  if (fechaRespuesta && horaRespuesta) {
    const end = new Date(`${fechaRespuesta}T${horaRespuesta}`);
    if (Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) {
      return { ok: false, error: "La fecha/hora de resolución no puede ser anterior al reporte" };
    }
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
      tipoServicio: tipoServicioResolved.value.name,
      canalOficina: canalOficinaResolved.value.name,
      gerencia: gerenciaResolved.value.name,
      motivoServicio: motivoServicioResolved.value.name,
      descripcion,
      encargado,
      fechaReporte,
      horaReporte,
      fechaToma,
      horaToma,
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
  const roles = getJwtRoles(payload);
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

  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
    return NextResponse.json({ error: "Solo se permiten archivos .csv, .xlsx o .xls" }, { status: 400 });
  }

  const [tiposServicio, canales, gerencias, motivosResult] = await Promise.all([
    loadCatalogMap("catalog_service_types"),
    loadCatalogMap("catalog_channels"),
    loadCatalogMap("catalog_gerencias"),
    db.query("SELECT id, name, service_type_id FROM catalog_motivos WHERE active = true"),
  ]);

  const motivos = new Map<string, MotivoCatalogValue>();
  for (const row of motivosResult.rows as Array<CatalogValue & { service_type_id: number }>) {
    motivos.set(normalizeHeader(row.name), {
      id: row.id,
      name: row.name,
      serviceTypeId: row.service_type_id,
    });
  }

  const normalizedRows = await parseSpreadsheet(file);
  if (normalizedRows.length === 0) {
    return NextResponse.json({ error: "El archivo no contiene filas" }, { status: 400 });
  }

  let inserted = 0;
  const errors: Array<{ row: number; error: string }> = [];

  for (let i = 0; i < normalizedRows.length; i += 1) {
    const parsed = parseRow(normalizedRows[i], {
      tiposServicio,
      canales,
      gerencias,
      motivos,
    });
    if (!parsed.ok) {
      errors.push({ row: i + 2, error: parsed.error });
      continue;
    }

    const item = parsed.value;
    const start = item.fechaToma && item.horaToma
      ? new Date(`${item.fechaToma}T${item.horaToma}`)
      : null;
    const hasResolution = Boolean(item.fechaRespuesta && item.horaRespuesta);
    const end = hasResolution ? new Date(`${item.fechaRespuesta}T${item.horaRespuesta}`) : null;
    const diffMinutes = start && end ? Math.floor((end.getTime() - start.getTime()) / 60000) : null;
    const categoria = diffMinutes === null ? null : categoriaPorTiempo(diffMinutes);
    const metrics = diffMinutes === null ? null : porcentajePorTiempo(diffMinutes);
    const mesAtencion = end ? monthFromDate(end) : null;

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
          fecha_toma,
          hora_toma,
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
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,now()
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
          item.fechaToma,
          item.horaToma,
          item.fechaRespuesta,
          item.horaRespuesta,
          item.accionTomada,
          item.primerContacto,
          diffMinutes,
          mesAtencion,
          categoria,
          metrics?.porcentaje ?? null,
          metrics?.regla ?? null,
          item.estado,
        ]
      );
      inserted += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error insertando fila";
      errors.push({ row: i + 2, error: message });
    }
  }

  const payload = {
    ok: true,
    total: normalizedRows.length,
    inserted,
    failed: errors.length,
    errors: errors.slice(0, 50),
    message:
      inserted === normalizedRows.length
        ? `Importación completada: ${inserted} registros cargados`
        : inserted > 0
          ? `Importación parcial: ${inserted} registros cargados y ${errors.length} con error`
          : "No se pudo importar ningún registro",
  };

  if (inserted === 0) {
    return NextResponse.json(
      {
        ...payload,
        ok: false,
      },
      { status: 400 }
    );
  }

  return NextResponse.json(payload);
}
