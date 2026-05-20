import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActorName, hasAnyRole, requireAuthContext, requireRoles } from "@/lib/security";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 500;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mine = searchParams.get("mine") === "true";
  const auth = mine ? await requireAuthContext() : await requireRoles(["SOPORTE", "SUPERVISOR", "ADMIN"]);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const status = searchParams.get("status");
  const tipoServicio = searchParams.get("tipoServicio");
  const canal = searchParams.get("canal");
  const gerencia = searchParams.get("gerencia");
  const mes = searchParams.get("mes");
  const tipoRegistro = searchParams.get("tipoRegistro");
  const search = searchParams.get("q");
  const cola = searchParams.get("cola");
  const id = searchParams.get("id");
  const externalId = searchParams.get("externalId");
  const solicitante = searchParams.get("solicitante");
  const encargado = searchParams.get("encargado");
  const motivo = searchParams.get("motivo");
  const categoria = searchParams.get("categoria");
  const primerContacto = searchParams.get("primerContacto");
  const fechaDesde = searchParams.get("fechaDesde");
  const fechaHasta = searchParams.get("fechaHasta");
  const tiempoMinDesde = searchParams.get("tiempoMinDesde");
  const tiempoMinHasta = searchParams.get("tiempoMinHasta");
  const rawPage = Number(searchParams.get("page") || DEFAULT_PAGE);
  const rawPageSize = Number(searchParams.get("pageSize") || DEFAULT_PAGE_SIZE);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : DEFAULT_PAGE;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0
    ? Math.min(Math.floor(rawPageSize), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const values: Array<string | number | boolean> = [];

  const add = (clause: string, value: string | number | boolean) => {
    values.push(value);
    where.push(`${clause} $${values.length}`);
  };

  const addLike = (column: string, value: string) => {
    values.push(`%${value}%`);
    where.push(`${column} ILIKE $${values.length}`);
  };

  if (status) add("estado =", status);
  if (tipoServicio) add("tipo_servicio =", tipoServicio);
  if (canal) add("canal_oficina =", canal);
  if (gerencia) add("gerencia =", gerencia);
  if (mes) add("mes_atencion =", mes);
  if (tipoRegistro) add("tipo_registro =", tipoRegistro);
  if (id) {
    const parsedId = Number(id);
    if (Number.isInteger(parsedId) && parsedId > 0) add("id =", parsedId);
  }
  if (externalId) addLike("COALESCE(external_id, '')", externalId);
  if (solicitante) addLike("solicitante", solicitante);
  if (encargado) addLike("encargado", encargado);
  if (motivo) addLike("motivo_servicio", motivo);
  if (categoria) addLike("COALESCE(categoria, '')", categoria);
  if (primerContacto === "true") add("primer_contacto =", true);
  if (primerContacto === "false") add("primer_contacto =", false);
  if (fechaDesde) add("fecha_reporte >=", fechaDesde);
  if (fechaHasta) add("fecha_reporte <=", fechaHasta);
  if (tiempoMinDesde) {
    const parsedMin = Number(tiempoMinDesde);
    if (Number.isFinite(parsedMin)) add("tiempo_minutos >=", parsedMin);
  }
  if (tiempoMinHasta) {
    const parsedMax = Number(tiempoMinHasta);
    if (Number.isFinite(parsedMax)) add("tiempo_minutos <=", parsedMax);
  }
  if (search) {
    values.push(`%${search}%`);
    where.push(
      `(solicitante ILIKE $${values.length} OR descripcion ILIKE $${values.length} OR motivo_servicio ILIKE $${values.length} OR COALESCE(external_id, '') ILIKE $${values.length})`
    );
  }
  if (cola === "sin_asignar") {
    values.push("SIN_ASIGNAR");
    where.push(`encargado = $${values.length}`);
  } else if (cola === "asignados") {
    values.push("SIN_ASIGNAR");
    where.push(`encargado <> $${values.length}`);
  }

  const restrictToAssigned = !mine && hasAnyRole(auth, ["SOPORTE"]) && !hasAnyRole(auth, ["SUPERVISOR", "ADMIN"]);
  if (restrictToAssigned && cola !== "sin_asignar") {
    values.push(getActorName(auth));
    where.push(`encargado = $${values.length}`);
  }
  if (mine) {
    values.push(auth.fullName || auth.username);
    where.push(`solicitante = $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const includeInternals = hasAnyRole(auth, ["SOPORTE", "SUPERVISOR", "ADMIN"]);
  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM incidents
     ${whereSql}`,
    values
  );
  const totalItems = countResult.rows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const baseSelect =
    `SELECT id, external_id, tipo_registro, solicitante, tipo_servicio, canal_oficina, gerencia, ` +
    `motivo_servicio, descripcion, encargado, fecha_reporte, hora_reporte, fecha_toma, hora_toma, ` +
    `fecha_respuesta, hora_respuesta, accion_tomada, primer_contacto, ` +
    `tiempo_minutos, mes_atencion, categoria, porcentaje, regla_porcentaje, ` +
    `estado, created_at` +
    (includeInternals ? `, clasificacion, last_updated_at` : ``);

  const result = await db.query(
    `${baseSelect}
     FROM incidents
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${values.length + 1}
     OFFSET $${values.length + 2}`,
    [...values, pageSize, offset]
  );

  return NextResponse.json({
    items: result.rows,
    meta: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  });
}
