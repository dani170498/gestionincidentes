import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActorName, hasAnyRole, requireRoles } from "@/lib/security";

export async function GET(req: Request) {
  const auth = await requireRoles(["SOPORTE", "SUPERVISOR", "ADMIN"]);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const fechaDesde = searchParams.get("fechaDesde");
  const fechaHasta = searchParams.get("fechaHasta");

  if (!fechaDesde || !fechaHasta) {
    return NextResponse.json({ error: "Debes indicar fechaDesde y fechaHasta" }, { status: 400 });
  }

  if (fechaDesde > fechaHasta) {
    return NextResponse.json({ error: "La fecha inicial no puede ser mayor a la fecha final" }, { status: 400 });
  }

  const where: string[] = ["fecha_reporte >= $1", "fecha_reporte <= $2"];
  const values: Array<string | number> = [fechaDesde, fechaHasta];

  const restrictToAssigned = hasAnyRole(auth, ["SOPORTE"]) && !hasAnyRole(auth, ["SUPERVISOR", "ADMIN"]);
  if (restrictToAssigned) {
    values.push(getActorName(auth));
    where.push(`encargado = $${values.length}`);
  }

  const result = await db.query(
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
       estado
     FROM incidents
     WHERE ${where.join(" AND ")}
     ORDER BY fecha_reporte ASC, hora_reporte ASC, id ASC`,
    values
  );

  return NextResponse.json({
    items: result.rows,
    meta: {
      totalItems: result.rows.length,
      fechaDesde,
      fechaHasta,
    },
  });
}
