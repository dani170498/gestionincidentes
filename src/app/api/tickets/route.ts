import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActorName, hasAnyRole, requireRoles } from "@/lib/security";

export async function GET(req: Request) {
  const auth = await requireRoles(["SOPORTE", "SUPERVISOR", "ADMIN"]);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const tipoServicio = searchParams.get("tipoServicio");
  const canal = searchParams.get("canal");
  const gerencia = searchParams.get("gerencia");
  const mes = searchParams.get("mes");
  const tipoRegistro = searchParams.get("tipoRegistro");
  const search = searchParams.get("q");
  const cola = searchParams.get("cola");

  const where: string[] = [];
  const values: Array<string | number> = [];

  const add = (clause: string, value: string | number) => {
    values.push(value);
    where.push(`${clause} $${values.length}`);
  };

  if (status) add("estado =", status);
  if (tipoServicio) add("tipo_servicio =", tipoServicio);
  if (canal) add("canal_oficina =", canal);
  if (gerencia) add("gerencia =", gerencia);
  if (mes) add("mes_atencion =", mes);
  if (tipoRegistro) add("tipo_registro =", tipoRegistro);
  if (search) {
    values.push(`%${search}%`);
    where.push(`(solicitante ILIKE $${values.length} OR descripcion ILIKE $${values.length})`);
  }
  if (cola === "sin_asignar") {
    values.push("SIN_ASIGNAR");
    where.push(`encargado = $${values.length}`);
  } else if (cola === "asignados") {
    values.push("SIN_ASIGNAR");
    where.push(`encargado <> $${values.length}`);
  }

  const restrictToAssigned = hasAnyRole(auth, ["SOPORTE"]) && !hasAnyRole(auth, ["SUPERVISOR", "ADMIN"]);
  if (restrictToAssigned && cola !== "sin_asignar") {
    values.push(getActorName(auth));
    where.push(`encargado = $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const includeInternals = hasAnyRole(auth, ["SOPORTE", "SUPERVISOR", "ADMIN"]);

  const baseSelect =
    `SELECT id, tipo_registro, solicitante, tipo_servicio, canal_oficina, gerencia, ` +
    `motivo_servicio, descripcion, encargado, fecha_reporte, hora_reporte, ` +
    `fecha_respuesta, hora_respuesta, accion_tomada, primer_contacto, ` +
    `tiempo_minutos, mes_atencion, categoria, porcentaje, regla_porcentaje, ` +
    `estado, created_at` +
    (includeInternals ? `, clasificacion, last_updated_at` : ``);

  const result = await db.query(
    `${baseSelect}
     FROM incidents
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT 500`,
    values
  );

  return NextResponse.json({ items: result.rows });
}
