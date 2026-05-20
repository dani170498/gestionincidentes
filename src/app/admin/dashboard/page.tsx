"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm, type Control, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { QueryClient, QueryClientProvider, keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { endOfMonth, format, startOfMonth, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Filter, LayoutDashboard, RefreshCw, Search, X } from "lucide-react";
import { normalizeDashboardFilters, type DashboardFilters } from "@/lib/dashboard-filters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const colors = ["#0b6e81", "#2b7a78", "#d08c32", "#e07a5f", "#81b29a", "#3d5a80", "#7c9885", "#4f6d7a"];
const pageSize = 25;
const dashboardFormSchema = z.object({
  fechaDesde: z.string(),
  fechaHasta: z.string(),
  estado: z.string(),
  tipoRegistro: z.string(),
  tipoServicio: z.string(),
  canal: z.string(),
  gerencia: z.string(),
  motivo: z.string(),
  encargado: z.string(),
  primerContacto: z.string(),
  q: z.string(),
});

type FilterValues = {
  fechaDesde: string;
  fechaHasta: string;
  estado: string;
  tipoRegistro: string;
  tipoServicio: string;
  canal: string;
  gerencia: string;
  motivo: string;
  encargado: string;
  primerContacto: string;
  q: string;
};

type DashboardOptions = {
  statuses: string[];
  tipoRegistro: string[];
  primerContacto: Array<{ value: string; label: string }>;
  serviceTypes: string[];
  channels: string[];
  gerencias: string[];
  motivos: string[];
  assignees: string[];
};

type ChartItem = { name: string; total: number };
type TrendItem = { period: string; total: number; resueltos: number };

type DashboardRow = {
  id: number;
  external_id: string | null;
  tipo_registro: string;
  solicitante: string;
  tipo_servicio: string;
  canal_oficina: string;
  gerencia: string;
  motivo_servicio: string;
  encargado: string;
  estado: string;
  fecha_reporte: string;
  tiempo_minutos: number;
  primer_contacto: boolean;
  created_at: string;
};

type DashboardSummaryData = {
  metrics: {
    total: number;
    resueltos: number;
    abiertos: number;
    promedioMinutos: number;
    tasaResolucion: number;
    primerContactoPct: number;
  };
  charts: {
    byStatus: ChartItem[];
    byTipoRegistro: ChartItem[];
    byCanal: ChartItem[];
    topMotivos: ChartItem[];
    trend: TrendItem[];
  };
  appliedFilters: DashboardFilters;
  scope: {
    restrictedToAssigned: boolean;
    actorName: string | null;
  };
};

type DashboardRowsData = {
  items: DashboardRow[];
  meta: {
    page: number;
    pageSize: number;
    sortBy: string;
    sortDir: "asc" | "desc";
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

type TableSortId =
  | "id"
  | "tipo_registro"
  | "estado"
  | "solicitante"
  | "encargado"
  | "tipo_servicio"
  | "motivo_servicio"
  | "canal_oficina"
  | "fecha_reporte"
  | "tiempo_minutos"
  | "primer_contacto"
  | "created_at";

const emptyFilters: FilterValues = {
  fechaDesde: "",
  fechaHasta: "",
  estado: "",
  tipoRegistro: "",
  tipoServicio: "",
  canal: "",
  gerencia: "",
  motivo: "",
  encargado: "",
  primerContacto: "",
  q: "",
};

const columnHelper = createColumnHelper<DashboardRow>();

function buildDefaultValues(params: URLSearchParams): FilterValues {
  return {
    fechaDesde: params.get("fechaDesde") || "",
    fechaHasta: params.get("fechaHasta") || "",
    estado: params.get("estado") || "",
    tipoRegistro: params.get("tipoRegistro") || "",
    tipoServicio: params.get("tipoServicio") || "",
    canal: params.get("canal") || "",
    gerencia: params.get("gerencia") || "",
    motivo: params.get("motivo") || "",
    encargado: params.get("encargado") || "",
    primerContacto: params.get("primerContacto") || "",
    q: params.get("q") || "",
  };
}

function buildTableState(params: URLSearchParams) {
  const page = Number(params.get("page") || "1");
  const sortBy = (params.get("sortBy") || "created_at") as TableSortId;
  const sortDir = params.get("sortDir") === "asc" ? "asc" : "desc";
  return {
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    sortBy,
    sortDir,
  };
}

function toDashboardFilters(values: FilterValues): DashboardFilters {
  return normalizeDashboardFilters({
    fechaDesde: values.fechaDesde || undefined,
    fechaHasta: values.fechaHasta || undefined,
    estado: values.estado || undefined,
    tipoRegistro: values.tipoRegistro || undefined,
    tipoServicio: values.tipoServicio || undefined,
    canal: values.canal || undefined,
    gerencia: values.gerencia || undefined,
    motivo: values.motivo || undefined,
    encargado: values.encargado || undefined,
    primerContacto: values.primerContacto === "true" || values.primerContacto === "false" ? values.primerContacto : undefined,
    q: values.q || undefined,
  });
}

function buildQueryString(filters: FilterValues, page: number, sorting: SortingState) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const currentSort = sorting[0];
  params.set("page", String(page));
  params.set("sortBy", (currentSort?.id as string) || "created_at");
  params.set("sortDir", currentSort?.desc ? "desc" : "asc");
  return params.toString();
}

function formatMetricMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function parseTrendLabel(period: string) {
  if (period.length === 7) {
    return format(new Date(`${period}-01T00:00:00`), "MMM yyyy", { locale: es });
  }
  return format(new Date(`${period}T00:00:00`), "dd MMM", { locale: es });
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || "No se pudo completar la solicitud");
  }
  return data as T;
}

export default function DashboardPage() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<main className="page"><section className="card">Cargando dashboard...</section></main>}>
        <DashboardContent />
      </Suspense>
    </QueryClientProvider>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFilters = useMemo(() => buildDefaultValues(searchParams), [searchParams]);
  const initialTableState = useMemo(() => buildTableState(searchParams), [searchParams]);

  const [submittedFilters, setSubmittedFilters] = useState<FilterValues>(initialFilters);
  const [page, setPage] = useState(initialTableState.page);
  const [sorting, setSorting] = useState<SortingState>([
    { id: initialTableState.sortBy, desc: initialTableState.sortDir === "desc" },
  ]);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting },
  } = useForm<FilterValues>({
    resolver: zodResolver(dashboardFormSchema),
    defaultValues: initialFilters,
  });

  const optionsQuery = useQuery({
    queryKey: ["dashboard-options"],
    queryFn: () => fetchJson<DashboardOptions>("/api/admin/dashboard/options"),
  });

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", submittedFilters],
    queryFn: () => {
      const params = new URLSearchParams();
      const normalized = toDashboardFilters(submittedFilters);
      for (const [key, value] of Object.entries(normalized)) {
        if (value) params.set(key, value);
      }
      const qs = params.toString();
      return fetchJson<DashboardSummaryData>(`/api/admin/dashboard${qs ? `?${qs}` : ""}`);
    },
  });

  const rowsQuery = useQuery({
    queryKey: ["dashboard-rows", submittedFilters, page, sorting],
    queryFn: () => {
      const params = new URLSearchParams();
      const normalized = toDashboardFilters(submittedFilters);
      for (const [key, value] of Object.entries(normalized)) {
        if (value) params.set(key, value);
      }
      const currentSort = sorting[0];
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("sortBy", (currentSort?.id as string) || "created_at");
      params.set("sortDir", currentSort?.desc ? "desc" : "asc");
      return fetchJson<DashboardRowsData>(`/api/admin/dashboard/rows?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor("id", {
        header: "Ticket",
        cell: (info) => {
          const row = info.row.original;
          return (
            <div>
              <strong>#{info.getValue()}</strong>
              <div className="muted">Ext: {row.external_id || "N/A"}</div>
            </div>
          );
        },
      }),
      columnHelper.accessor("tipo_registro", { header: "Tipo" }),
      columnHelper.accessor("estado", { header: "Estado" }),
      columnHelper.accessor("solicitante", { header: "Solicitante" }),
      columnHelper.accessor("encargado", { header: "Encargado" }),
      columnHelper.accessor("tipo_servicio", { header: "Servicio" }),
      columnHelper.accessor("motivo_servicio", { header: "Motivo" }),
      columnHelper.accessor("canal_oficina", { header: "Canal" }),
      columnHelper.accessor("fecha_reporte", { header: "Fecha reporte" }),
      columnHelper.accessor("tiempo_minutos", {
        header: "Tiempo",
        cell: (info) => formatMetricMinutes(info.getValue()),
      }),
      columnHelper.accessor("primer_contacto", {
        header: "1er contacto",
        cell: (info) => (info.getValue() ? "Sí" : "No"),
      }),
      columnHelper.accessor("created_at", {
        header: "Creado",
        cell: (info) => format(new Date(info.getValue()), "dd/MM/yyyy HH:mm"),
      }),
    ],
    []
  );

  const table = useReactTable({
    data: rowsQuery.data?.items ?? [],
    columns,
    state: { sorting },
    manualSorting: true,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(next);
      setPage(1);
      const qs = buildQueryString(submittedFilters, 1, next);
      router.replace(`/admin/dashboard?${qs}`);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  function submitFilters(values: FilterValues) {
    const normalized = toDashboardFilters(values);
    const nextFilters = {
      fechaDesde: normalized.fechaDesde || "",
      fechaHasta: normalized.fechaHasta || "",
      estado: normalized.estado || "",
      tipoRegistro: normalized.tipoRegistro || "",
      tipoServicio: normalized.tipoServicio || "",
      canal: normalized.canal || "",
      gerencia: normalized.gerencia || "",
      motivo: normalized.motivo || "",
      encargado: normalized.encargado || "",
      primerContacto: normalized.primerContacto || "",
      q: normalized.q || "",
    };

    setSubmittedFilters(nextFilters);
    setPage(1);
    const qs = buildQueryString(nextFilters, 1, sorting);
    router.replace(`/admin/dashboard?${qs}`);
  }

  function applyPreset(preset: "7d" | "30d" | "mes" | "todo") {
    if (preset === "todo") {
      setValue("fechaDesde", "");
      setValue("fechaHasta", "");
      return;
    }

    if (preset === "mes") {
      const now = new Date();
      setValue("fechaDesde", format(startOfMonth(now), "yyyy-MM-dd"));
      setValue("fechaHasta", format(endOfMonth(now), "yyyy-MM-dd"));
      return;
    }

    const days = preset === "7d" ? 7 : 30;
    setValue("fechaDesde", format(subDays(new Date(), days - 1), "yyyy-MM-dd"));
    setValue("fechaHasta", format(new Date(), "yyyy-MM-dd"));
  }

  function goToPage(nextPage: number) {
    setPage(nextPage);
    const qs = buildQueryString(submittedFilters, nextPage, sorting);
    router.replace(`/admin/dashboard?${qs}`);
  }

  const summary = summaryQuery.data;
  const rows = rowsQuery.data;

  return (
    <main className="page">
      <section className="hero-panel hero-panel--compact">
        <div className="hero-panel__content">
          <div className="page-header">
            <span className="page-kicker">Dashboard</span>
            <h1 className="page-title">Visión global filtrable de tickets</h1>
            <p className="page-subtitle">
              El resumen carga por separado de la tabla para responder más rápido cuando cambias página u orden.
            </p>
          </div>
          <div className="hero-panel__meta">
            <span className="topbar-chip topbar-chip--accent">
              <LayoutDashboard className="h-4 w-4" />
              KPIs + gráficos + detalle paginado
            </span>
            {summary?.scope.restrictedToAssigned && summary.scope.actorName && (
              <span className="topbar-chip topbar-chip--warning">Alcance restringido a {summary.scope.actorName}</span>
            )}
          </div>
        </div>
      </section>

      <section className="card stack">
        <div className="page-header">
          <h2 className="section-title">Verificación de consulta</h2>
          <p className="page-lead">
            Esta sección muestra exactamente qué filtros recibió y aplicó el backend para construir los gráficos y KPIs.
          </p>
        </div>
        <div className="dashboard-applied">
          {Object.entries(summary?.appliedFilters ?? {}).filter(([, value]) => value).length === 0 ? (
            <span className="topbar-chip">Sin filtros activos</span>
          ) : (
            Object.entries(summary?.appliedFilters ?? {})
              .filter(([, value]) => value)
              .map(([key, value]) => (
                <span key={key} className="topbar-chip">
                  {key}: {String(value)}
                </span>
              ))
          )}
        </div>
      </section>

      <section className="card stack">
        <div className="page-header">
          <h2 className="section-title">Filtros globales</h2>
          <p className="page-lead">
            Los filtros impactan métricas, gráficos y tabla. La tabla usa paginación y orden del lado servidor.
          </p>
        </div>

        <form className="form" onSubmit={handleSubmit(submitFilters)}>
          <div className="tabs">
            <button className="tab" type="button" onClick={() => applyPreset("7d")}>Últimos 7 días</button>
            <button className="tab" type="button" onClick={() => applyPreset("30d")}>Últimos 30 días</button>
            <button className="tab" type="button" onClick={() => applyPreset("mes")}>Mes actual</button>
            <button className="tab" type="button" onClick={() => applyPreset("todo")}>Todo</button>
          </div>

          <div className="dashboard-filters">
            <label className="field">
              <span className="label">Fecha desde</span>
              <input className="input" type="date" {...register("fechaDesde")} />
            </label>

            <label className="field">
              <span className="label">Fecha hasta</span>
              <input className="input" type="date" {...register("fechaHasta")} />
            </label>

            <DashboardSelectField control={control} name="estado" label="Estado" placeholder="Todos" options={optionsQuery.data?.statuses ?? []} />
            <DashboardSelectField control={control} name="tipoRegistro" label="Tipo de registro" placeholder="Todos" options={optionsQuery.data?.tipoRegistro ?? []} />
            <DashboardSelectField control={control} name="tipoServicio" label="Tipo de servicio" placeholder="Todos" options={optionsQuery.data?.serviceTypes ?? []} />
            <DashboardSelectField control={control} name="canal" label="Canal" placeholder="Todos" options={optionsQuery.data?.channels ?? []} />
            <DashboardSelectField control={control} name="gerencia" label="Gerencia" placeholder="Todas" options={optionsQuery.data?.gerencias ?? []} />
            <DashboardSelectField control={control} name="motivo" label="Motivo" placeholder="Todos" options={optionsQuery.data?.motivos ?? []} />
            <DashboardSelectField control={control} name="encargado" label="Encargado" placeholder="Todos" options={optionsQuery.data?.assignees ?? []} />
            <DashboardSelectField
              control={control}
              name="primerContacto"
              label="Primer contacto"
              placeholder="Todos"
              options={(optionsQuery.data?.primerContacto ?? []).map((item) => ({ label: item.label, value: item.value }))}
            />

            <label className="field dashboard-search">
              <span className="label">Búsqueda libre</span>
              <div className="dashboard-search__box">
                <Search className="h-4 w-4" />
                <input className="input dashboard-search__input" placeholder="ID, solicitante, descripción..." {...register("q")} />
              </div>
            </label>
          </div>

          <div className="actions-row">
            <button className="button" type="submit" disabled={isSubmitting || summaryQuery.isFetching}>
              <Filter className="h-4 w-4" />
              {summaryQuery.isFetching ? "Actualizando..." : "Aplicar filtros"}
            </button>
            <button
              className="nav-link"
              type="button"
              onClick={() => {
                reset(emptyFilters);
                setSubmittedFilters(emptyFilters);
                setPage(1);
                const resetSorting: SortingState = [{ id: "created_at", desc: true }];
                setSorting(resetSorting);
                router.replace(`/admin/dashboard?${buildQueryString(emptyFilters, 1, resetSorting)}`);
              }}
            >
              <X className="h-4 w-4" />
              Limpiar
            </button>
            <button
              className="nav-link"
              type="button"
              onClick={() => {
                void summaryQuery.refetch();
                void rowsQuery.refetch();
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Refrescar
            </button>
          </div>
        </form>
      </section>

      {summaryQuery.isError && <p className="error">{summaryQuery.error.message}</p>}
      {rowsQuery.isError && <p className="error">{rowsQuery.error.message}</p>}

      <section className="metric-strip">
        <MetricCard label="Total tickets" value={String(summary?.metrics.total ?? 0)} />
        <MetricCard label="Resueltos" value={String(summary?.metrics.resueltos ?? 0)} />
        <MetricCard label="Abiertos" value={String(summary?.metrics.abiertos ?? 0)} />
        <MetricCard label="Resolución" value={`${summary?.metrics.tasaResolucion ?? 0}%`} />
        <MetricCard label="Primer contacto" value={`${summary?.metrics.primerContactoPct ?? 0}%`} />
        <MetricCard label="Tiempo promedio" value={formatMetricMinutes(summary?.metrics.promedioMinutos ?? 0)} />
      </section>

      <section className="dashboard-grid">
        <div className="card">
          <div className="page-header">
            <h2 className="section-title">Tendencia de tickets</h2>
            <p className="page-lead">Comparativo entre volumen total y resueltos según el rango filtrado.</p>
          </div>
          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={(summary?.charts.trend ?? []).map((item) => ({ ...item, label: parseTrendLabel(item.period) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(84, 103, 120, 0.18)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="total" name="Total" stroke="#0b6e81" fill="rgba(11,110,129,0.18)" />
                <Area type="monotone" dataKey="resueltos" name="Resueltos" stroke="#2b7a78" fill="rgba(43,122,120,0.18)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="page-header">
            <h2 className="section-title">Estados</h2>
            <p className="page-lead">Distribución del backlog operativo en el filtro actual.</p>
          </div>
          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary?.charts.byStatus ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(84, 103, 120, 0.18)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="total" radius={[10, 10, 0, 0]}>
                  {(summary?.charts.byStatus ?? []).map((item, index) => (
                    <Cell key={item.name} fill={colors[index % colors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="page-header">
            <h2 className="section-title">Tipo de registro</h2>
            <p className="page-lead">Balance entre incidentes y solicitudes de soporte.</p>
          </div>
          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={summary?.charts.byTipoRegistro ?? []} dataKey="total" nameKey="name" outerRadius={108} label>
                  {(summary?.charts.byTipoRegistro ?? []).map((item, index) => (
                    <Cell key={item.name} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="page-header">
            <h2 className="section-title">Canales principales</h2>
            <p className="page-lead">Dónde entra más demanda en el periodo consultado.</p>
          </div>
          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary?.charts.byCanal ?? []} layout="vertical" margin={{ left: 18, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(84, 103, 120, 0.18)" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="total" radius={[0, 10, 10, 0]}>
                  {(summary?.charts.byCanal ?? []).map((item, index) => (
                    <Cell key={item.name} fill={colors[index % colors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card dashboard-grid__full">
          <div className="page-header">
            <h2 className="section-title">Motivos más frecuentes</h2>
            <p className="page-lead">Prioriza causas recurrentes con mayor volumen acumulado.</p>
          </div>
          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary?.charts.topMotivos ?? []} margin={{ left: 16, right: 12, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(84, 103, 120, 0.18)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-10} textAnchor="end" height={80} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="total" radius={[10, 10, 0, 0]}>
                  {(summary?.charts.topMotivos ?? []).map((item, index) => (
                    <Cell key={item.name} fill={colors[index % colors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="card stack">
        <div className="page-header">
          <h2 className="section-title">Detalle paginado</h2>
          <p className="page-lead">
            Página {rows?.meta.page ?? 1} de {rows?.meta.totalPages ?? 1}. Total filtrado: {rows?.meta.totalItems ?? 0} tickets.
          </p>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      style={{ cursor: header.column.getCanSort() ? "pointer" : "default" }}
                    >
                      {header.isPlaceholder ? null : (
                        <span>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: " ↑",
                            desc: " ↓",
                          }[header.column.getIsSorted() as string] ?? null}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length}>
                    <span className="muted">No hay tickets para el filtro actual.</span>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="actions-row">
          <button className="nav-link" type="button" onClick={() => goToPage((rows?.meta.page ?? 1) - 1)} disabled={!rows?.meta.hasPreviousPage}>
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </button>
          <span className="topbar-chip">
            {rowsQuery.isFetching ? "Cargando página..." : `Mostrando ${rows?.items.length ?? 0} registros`}
          </span>
          <button className="nav-link" type="button" onClick={() => goToPage((rows?.meta.page ?? 1) + 1)} disabled={!rows?.meta.hasNextPage}>
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function DashboardSelectField<TFieldValues extends FilterValues>({
  control,
  name,
  label,
  placeholder,
  options,
}: {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  placeholder: string;
  options: Array<string | { label: string; value: string }>;
}) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={field.value || "__all__"} onValueChange={(value) => field.onChange(value === "__all__" ? "" : value)}>
            <SelectTrigger className="dashboard-select-trigger">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{placeholder}</SelectItem>
              {options.map((option) => {
                const value = typeof option === "string" ? option : option.value;
                const text = typeof option === "string" ? option : option.label;
                return (
                  <SelectItem key={value} value={value}>
                    {text}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      />
    </label>
  );
}
