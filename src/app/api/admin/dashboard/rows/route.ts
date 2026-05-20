import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { db } from "@/lib/db";
import { buildDashboardWhere, dashboardRowsSchema, normalizeDashboardFilters } from "@/lib/dashboard-filters";
import { getActorName, hasAnyRole, requireRoles } from "@/lib/security";

const sortColumnMap: Record<string, string> = {
  id: "id",
  tipo_registro: "tipo_registro",
  estado: "estado",
  solicitante: "solicitante",
  encargado: "encargado",
  tipo_servicio: "tipo_servicio",
  motivo_servicio: "motivo_servicio",
  canal_oficina: "canal_oficina",
  fecha_reporte: "fecha_reporte",
  tiempo_minutos: "tiempo_minutos",
  primer_contacto: "primer_contacto",
  created_at: "created_at",
};

export async function GET(req: Request) {
  noStore();
  const auth = await requireRoles(["SOPORTE", "SUPERVISOR", "ADMIN"]);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const rawFilters = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = dashboardRowsSchema.safeParse(rawFilters);
  if (!parsed.success) {
    return NextResponse.json({ error: "Filtros inválidos" }, { status: 400 });
  }

  const filters = {
    ...parsed.data,
    ...normalizeDashboardFilters(parsed.data),
  };
  const actorScope = hasAnyRole(auth, ["SUPERVISOR", "ADMIN"]) ? null : getActorName(auth);
  const { values, whereSql } = buildDashboardWhere(filters, actorScope);
  const sortBy = sortColumnMap[filters.sortBy] || "created_at";
  const sortDir = filters.sortDir === "asc" ? "ASC" : "DESC";
  const offset = (filters.page - 1) * filters.pageSize;

  const [countResult, rowsResult] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM incidents
       ${whereSql}`,
      values
    ),
    db.query(
      `SELECT
         id,
         external_id,
         tipo_registro,
         solicitante,
         tipo_servicio,
         canal_oficina,
         gerencia,
         motivo_servicio,
         encargado,
         estado,
         fecha_reporte,
         tiempo_minutos,
         primer_contacto,
         created_at
       FROM incidents
       ${whereSql}
       ORDER BY ${sortBy} ${sortDir}, id DESC
       LIMIT $${values.length + 1}
       OFFSET $${values.length + 2}`,
      [...values, filters.pageSize, offset]
    ),
  ]);

  const totalItems = countResult.rows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / filters.pageSize));

  return NextResponse.json({
    items: rowsResult.rows,
    meta: {
      page: filters.page,
      pageSize: filters.pageSize,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
      totalItems,
      totalPages,
      hasNextPage: filters.page < totalPages,
      hasPreviousPage: filters.page > 1,
    },
    scope: {
      restrictedToAssigned: Boolean(actorScope),
      actorName: actorScope,
    },
  });
}
