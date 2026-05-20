-- Índices recomendados para acelerar el dashboard global.
-- Aplicar manualmente sobre PostgreSQL:
--   psql "$DATABASE_URL" -f db/dashboard_indexes.sql

-- Búsqueda parcial con ILIKE '%texto%'
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS incidents_estado_fecha_reporte_idx
  ON incidents (estado, fecha_reporte DESC);

CREATE INDEX IF NOT EXISTS incidents_tipo_registro_fecha_reporte_idx
  ON incidents (tipo_registro, fecha_reporte DESC);

CREATE INDEX IF NOT EXISTS incidents_encargado_fecha_reporte_idx
  ON incidents (encargado, fecha_reporte DESC);

CREATE INDEX IF NOT EXISTS incidents_gerencia_fecha_reporte_idx
  ON incidents (gerencia, fecha_reporte DESC);

CREATE INDEX IF NOT EXISTS incidents_canal_fecha_reporte_idx
  ON incidents (canal_oficina, fecha_reporte DESC);

CREATE INDEX IF NOT EXISTS incidents_tipo_servicio_fecha_reporte_idx
  ON incidents (tipo_servicio, fecha_reporte DESC);

CREATE INDEX IF NOT EXISTS incidents_motivo_fecha_reporte_idx
  ON incidents (motivo_servicio, fecha_reporte DESC);

CREATE INDEX IF NOT EXISTS incidents_solicitante_trgm_idx
  ON incidents USING gin (solicitante gin_trgm_ops);

CREATE INDEX IF NOT EXISTS incidents_descripcion_trgm_idx
  ON incidents USING gin (descripcion gin_trgm_ops);

CREATE INDEX IF NOT EXISTS incidents_motivo_trgm_idx
  ON incidents USING gin (motivo_servicio gin_trgm_ops);

CREATE INDEX IF NOT EXISTS incidents_encargado_trgm_idx
  ON incidents USING gin (encargado gin_trgm_ops);

CREATE INDEX IF NOT EXISTS incidents_external_id_trgm_idx
  ON incidents USING gin (external_id gin_trgm_ops);
