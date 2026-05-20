-- Recalcula KPI para tickets ya resueltos usando toma -> resolucion.
-- Util para registros historicos que quedaron con tiempo_minutos/categoria/porcentaje/regla/mes_atencion en NULL.

WITH recalculo AS (
  SELECT
    id,
    FLOOR(
      EXTRACT(
        EPOCH FROM (
          (fecha_respuesta::timestamp + hora_respuesta) -
          (fecha_toma::timestamp + hora_toma)
        )
      ) / 60
    )::int AS diff_minutes
  FROM incidents
  WHERE estado = 'RESUELTO'
    AND fecha_toma IS NOT NULL
    AND hora_toma IS NOT NULL
    AND fecha_respuesta IS NOT NULL
    AND hora_respuesta IS NOT NULL
    AND (fecha_respuesta::timestamp + hora_respuesta) >= (fecha_toma::timestamp + hora_toma)
    AND (
      tiempo_minutos IS NULL OR
      categoria IS NULL OR
      porcentaje IS NULL OR
      regla_porcentaje IS NULL OR
      mes_atencion IS NULL
    )
)
UPDATE incidents i
SET
  tiempo_minutos = r.diff_minutes,
  categoria = CASE
    WHEN r.diff_minutes < 60 THEN 'Menos de 1 hora'
    WHEN r.diff_minutes < 120 THEN '1 - 2 horas'
    WHEN r.diff_minutes < 240 THEN '2 - 4 horas'
    ELSE 'Más de 4 horas'
  END,
  porcentaje = CASE
    WHEN r.diff_minutes < 60 THEN 100
    WHEN r.diff_minutes < 120 THEN 75
    WHEN r.diff_minutes < 240 THEN 50
    ELSE 25
  END,
  regla_porcentaje = CASE
    WHEN r.diff_minutes < 60 THEN '< 1 hora = 100%'
    WHEN r.diff_minutes < 120 THEN '1 - 2 horas = 75%'
    WHEN r.diff_minutes < 240 THEN '2 - 4 horas = 50%'
    ELSE '> 4 horas = 25%'
  END,
  mes_atencion = TO_CHAR(i.fecha_respuesta, 'YYYY-MM'),
  last_updated_at = now()
FROM recalculo r
WHERE i.id = r.id;
