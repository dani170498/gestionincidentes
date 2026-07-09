import { db } from "@/lib/db";
import { getActorName, hasAnyRole, type AuthContext } from "@/lib/security";

export type ReportItem = {
  id: number;
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
  accion_tomada: string;
  primer_contacto: boolean;
  tiempo_minutos: number | null;
  mes_atencion: string | null;
  categoria: string | null;
  porcentaje: number | null;
  estado: string;
};

export type ReportMeta = {
  totalItems: number;
  fechaDesde: string;
  fechaHasta: string;
};

export async function getResolvedTicketsReport(
  auth: AuthContext,
  fechaDesde: string,
  fechaHasta: string
): Promise<{ items: ReportItem[]; meta: ReportMeta }> {
  const where: string[] = ["fecha_reporte >= $1", "fecha_reporte <= $2"];
  const values: Array<string | number> = [fechaDesde, fechaHasta];

  const restrictToAssigned = hasAnyRole(auth, ["SOPORTE"]) && !hasAnyRole(auth, ["SUPERVISOR", "ADMIN"]);
  if (restrictToAssigned) {
    values.push(getActorName(auth));
    where.push(`encargado = $${values.length}`);
  }

  const result = (await db.query(
    `SELECT
       id,
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
       CASE
         WHEN fecha_toma IS NOT NULL AND hora_toma IS NOT NULL THEN fecha_toma
         WHEN fecha_respuesta IS NOT NULL AND hora_respuesta IS NOT NULL THEN fecha_reporte
         ELSE fecha_toma
       END AS fecha_toma,
       CASE
         WHEN fecha_toma IS NOT NULL AND hora_toma IS NOT NULL THEN hora_toma
         WHEN fecha_respuesta IS NOT NULL AND hora_respuesta IS NOT NULL THEN hora_reporte
         ELSE hora_toma
       END AS hora_toma,
       fecha_respuesta,
       hora_respuesta,
       accion_tomada,
       primer_contacto,
       tiempo_minutos,
       mes_atencion,
       categoria,
       porcentaje,
       estado
     FROM incidents
     WHERE ${where.join(" AND ")}
     ORDER BY fecha_reporte ASC, hora_reporte ASC, id ASC`,
    values
  )) as { rows: ReportItem[] };

  return {
    items: result.rows,
    meta: {
      totalItems: result.rows.length,
      fechaDesde,
      fechaHasta,
    },
  };
}
