import { z } from "zod";

export const dashboardFilterSchema = z.object({
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  estado: z.string().optional(),
  tipoRegistro: z.string().optional(),
  tipoServicio: z.string().optional(),
  canal: z.string().optional(),
  gerencia: z.string().optional(),
  motivo: z.string().optional(),
  encargado: z.string().optional(),
  primerContacto: z.enum(["true", "false"]).optional(),
  q: z.string().optional(),
});

export const dashboardRowsSchema = dashboardFilterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  sortBy: z
    .enum([
      "id",
      "tipo_registro",
      "estado",
      "solicitante",
      "encargado",
      "tipo_servicio",
      "motivo_servicio",
      "canal_oficina",
      "fecha_reporte",
      "tiempo_minutos",
      "primer_contacto",
      "created_at",
    ])
    .default("created_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type DashboardFilters = z.infer<typeof dashboardFilterSchema>;
export type DashboardRowsFilters = z.infer<typeof dashboardRowsSchema>;

export function normalizeDashboardFilters(filters: DashboardFilters): DashboardFilters {
  const cleanedEntries = Object.entries(filters).map(([key, value]) => {
    if (typeof value !== "string") return [key, value] as const;
    const trimmed = value.trim();
    return [key, trimmed || undefined] as const;
  });

  return Object.fromEntries(cleanedEntries) as DashboardFilters;
}

export function buildDashboardWhere(filters: DashboardFilters, actorScope: string | null) {
  const normalized = normalizeDashboardFilters(filters);
  const where: string[] = [];
  const values: Array<string | boolean | number> = [];

  const add = (clause: string, value: string | boolean | number) => {
    values.push(value);
    where.push(`${clause} $${values.length}`);
  };

  const addLike = (columns: string[], value: string) => {
    values.push(`%${value}%`);
    where.push(`(${columns.map((column) => `${column} ILIKE $${values.length}`).join(" OR ")})`);
  };

  if (normalized.fechaDesde) add("fecha_reporte >=", normalized.fechaDesde);
  if (normalized.fechaHasta) add("fecha_reporte <=", normalized.fechaHasta);
  if (normalized.estado) add("estado =", normalized.estado);
  if (normalized.tipoRegistro) add("tipo_registro =", normalized.tipoRegistro);
  if (normalized.tipoServicio) add("tipo_servicio =", normalized.tipoServicio);
  if (normalized.canal) add("canal_oficina =", normalized.canal);
  if (normalized.gerencia) add("gerencia =", normalized.gerencia);
  if (normalized.motivo) add("motivo_servicio =", normalized.motivo);
  if (normalized.encargado) add("encargado =", normalized.encargado);
  if (normalized.primerContacto) add("primer_contacto =", normalized.primerContacto === "true");

  if (normalized.q) {
    addLike(
      ["COALESCE(external_id, '')", "solicitante", "descripcion", "encargado", "motivo_servicio"],
      normalized.q
    );
  }

  if (actorScope) add("encargado =", actorScope);

  return {
    values,
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
  };
}

export function buildTrendGroup(filters: DashboardFilters) {
  const normalized = normalizeDashboardFilters(filters);
  if (!normalized.fechaDesde || !normalized.fechaHasta) return "month";
  const start = new Date(`${normalized.fechaDesde}T00:00:00`);
  const end = new Date(`${normalized.fechaHasta}T00:00:00`);
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  return diffDays <= 62 ? "day" : "month";
}
