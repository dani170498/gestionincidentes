import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { db } from "@/lib/db";
import {
  buildDashboardWhere,
  buildTrendGroup,
  dashboardFilterSchema,
  normalizeDashboardFilters,
} from "@/lib/dashboard-filters";
import { getActorName, hasAnyRole, requireRoles } from "@/lib/security";

export async function GET(req: Request) {
  noStore();
  const auth = await requireRoles(["SOPORTE", "SUPERVISOR", "ADMIN"]);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const rawFilters = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = dashboardFilterSchema.safeParse(rawFilters);
  if (!parsed.success) {
    return NextResponse.json({ error: "Filtros inválidos" }, { status: 400 });
  }

  const filters = normalizeDashboardFilters(parsed.data);
  const actorScope = hasAnyRole(auth, ["SUPERVISOR", "ADMIN"]) ? null : getActorName(auth);
  const { values, whereSql } = buildDashboardWhere(filters, actorScope);
  const trendGroup = buildTrendGroup(filters);
  const periodExpr =
    trendGroup === "day"
      ? "to_char(fecha_reporte::date, 'YYYY-MM-DD')"
      : "to_char(date_trunc('month', fecha_reporte::date), 'YYYY-MM')";

  const [metricsResult, statusResult, tipoRegistroResult, canalResult, motivoResult, trendResult] = await Promise.all([
    db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE estado = 'RESUELTO')::int AS resueltos,
         COUNT(*) FILTER (WHERE estado IN ('REGISTRADO', 'EN_ATENCION', 'RESPONDIDO'))::int AS abiertos,
         COUNT(*) FILTER (WHERE primer_contacto = true)::int AS primer_contacto_total,
         COALESCE(ROUND(AVG(tiempo_minutos))::int, 0) AS promedio_minutos
       FROM incidents
       ${whereSql}`,
      values
    ),
    db.query(
      `SELECT estado AS name, COUNT(*)::int AS total
       FROM incidents
       ${whereSql}
       GROUP BY estado
       ORDER BY total DESC, estado ASC`,
      values
    ),
    db.query(
      `SELECT tipo_registro AS name, COUNT(*)::int AS total
       FROM incidents
       ${whereSql}
       GROUP BY tipo_registro
       ORDER BY total DESC, tipo_registro ASC`,
      values
    ),
    db.query(
      `SELECT canal_oficina AS name, COUNT(*)::int AS total
       FROM incidents
       ${whereSql}
       GROUP BY canal_oficina
       ORDER BY total DESC, canal_oficina ASC
       LIMIT 8`,
      values
    ),
    db.query(
      `SELECT motivo_servicio AS name, COUNT(*)::int AS total
       FROM incidents
       ${whereSql}
       GROUP BY motivo_servicio
       ORDER BY total DESC, motivo_servicio ASC
       LIMIT 8`,
      values
    ),
    db.query(
      `SELECT
         ${periodExpr} AS period,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE estado = 'RESUELTO')::int AS resueltos
       FROM incidents
       ${whereSql}
       GROUP BY 1
       ORDER BY MIN(fecha_reporte) ASC`,
      values
    ),
  ]);

  const metricsRow = metricsResult.rows[0] as {
    total: number;
    resueltos: number;
    abiertos: number;
    primer_contacto_total: number;
    promedio_minutos: number;
  };
  const total = metricsRow?.total ?? 0;
  const resueltos = metricsRow?.resueltos ?? 0;
  const abiertos = metricsRow?.abiertos ?? 0;
  const primerContactoTotal = metricsRow?.primer_contacto_total ?? 0;
  const promedioMinutos = metricsRow?.promedio_minutos ?? 0;

  return NextResponse.json({
    metrics: {
      total,
      resueltos,
      abiertos,
      promedioMinutos,
      tasaResolucion: total ? Number(((resueltos / total) * 100).toFixed(1)) : 0,
      primerContactoPct: total ? Number(((primerContactoTotal / total) * 100).toFixed(1)) : 0,
    },
    charts: {
      byStatus: statusResult.rows,
      byTipoRegistro: tipoRegistroResult.rows,
      byCanal: canalResult.rows,
      topMotivos: motivoResult.rows,
      trend: trendResult.rows,
    },
    appliedFilters: filters,
    scope: {
      restrictedToAssigned: Boolean(actorScope),
      actorName: actorScope,
    },
  });
}
