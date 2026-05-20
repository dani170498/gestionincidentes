-- Migra el ciclo de vida del ticket a: reporte -> toma -> resolucion

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS fecha_toma DATE,
  ADD COLUMN IF NOT EXISTS hora_toma TIME;

ALTER TABLE incidents
  ALTER COLUMN fecha_respuesta DROP NOT NULL,
  ALTER COLUMN hora_respuesta DROP NOT NULL,
  ALTER COLUMN accion_tomada DROP NOT NULL,
  ALTER COLUMN tiempo_minutos DROP NOT NULL,
  ALTER COLUMN mes_atencion DROP NOT NULL;

-- Renombra semanticamente la "respuesta" existente como "resolucion"
-- manteniendo las columnas actuales para no romper integraciones de golpe.
COMMENT ON COLUMN incidents.fecha_reporte IS 'Fecha en que se reporta el ticket';
COMMENT ON COLUMN incidents.hora_reporte IS 'Hora en que se reporta el ticket';
COMMENT ON COLUMN incidents.fecha_toma IS 'Fecha en que el ticket es tomado por soporte';
COMMENT ON COLUMN incidents.hora_toma IS 'Hora en que el ticket es tomado por soporte';
COMMENT ON COLUMN incidents.fecha_respuesta IS 'Fecha de resolucion del ticket';
COMMENT ON COLUMN incidents.hora_respuesta IS 'Hora de resolucion del ticket';
