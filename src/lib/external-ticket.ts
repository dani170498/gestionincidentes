import { db } from "@/lib/db";

export type ExternalTicketRow = {
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
  fecha_respuesta: string | null;
  hora_respuesta: string | null;
  accion_tomada: string | null;
  primer_contacto: boolean;
  tiempo_minutos: number | null;
  mes_atencion: string | null;
  categoria: string | null;
  porcentaje: string | number | null;
  regla_porcentaje: string | null;
  estado: string;
  clasificacion: string | null;
  created_at: string;
  last_updated_at: string;
};

export function isExternalAuthorized(req: Request): boolean {
  const apiKey = req.headers.get("x-api-key") || "";
  const expected = process.env.EXTERNAL_API_KEY || "";
  return Boolean(expected) && apiKey === expected;
}

export function combineLaPazDateTime(date?: string | null, time?: string | null) {
  if (!date || !time) return null;
  return `${date}T${time.slice(0, 8)}-04:00`;
}

export async function findExternalTicketById(ticketId: string): Promise<ExternalTicketRow | null> {
  const normalizedTicketId = ticketId.trim();
  if (!normalizedTicketId) return null;

  const numericTicketId = /^\d+$/.test(normalizedTicketId) ? Number(normalizedTicketId) : null;
  const result = await db.query(
    `SELECT id, external_id, tipo_registro, solicitante, tipo_servicio, canal_oficina, gerencia,
            motivo_servicio, descripcion, encargado, fecha_reporte, hora_reporte, fecha_toma, hora_toma,
            fecha_respuesta, hora_respuesta, accion_tomada, primer_contacto,
            tiempo_minutos, mes_atencion, categoria, porcentaje, regla_porcentaje,
            estado, clasificacion, created_at, last_updated_at
     FROM incidents
     WHERE external_id = $1 OR ($2::int IS NOT NULL AND id = $2)
     LIMIT 1`,
    [normalizedTicketId, numericTicketId]
  );

  if (result.rowCount === 0) return null;
  return result.rows[0] as ExternalTicketRow;
}
