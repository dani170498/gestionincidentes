import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessTicket, getActorName, getIncidentSecurityRow, requireRoles } from "@/lib/security";
import { getLaPazDateTimeParts } from "@/lib/utils";

type SupportTargetRow = {
  full_name: string | null;
  username: string;
};

async function resolveSupportAssignee(assignTo: string) {
  const result = (await db.query(
    `SELECT DISTINCT u.full_name, u.username
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     WHERE u.active = true
       AND (u.role = 'SOPORTE' OR ur.role = 'SOPORTE')
       AND ($1 IN (u.username, COALESCE(u.full_name, '')))
     LIMIT 1`,
    [assignTo]
  )) as { rowCount: number; rows: SupportTargetRow[] };
  if (result.rowCount === 0) return null;
  return result.rows[0].full_name || result.rows[0].username;
}

function isValidDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTimeInput(value: string) {
  return /^\d{2}:\d{2}(:\d{2})?$/.test(value);
}

function normalizeTimeInput(value: string) {
  return value.length === 5 ? `${value}:00` : value;
}

function toComparableDate(date: string, time: string) {
  return new Date(`${date}T${normalizeTimeInput(time)}-04:00`);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["SOPORTE", "SUPERVISOR", "ADMIN"]);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const incidentId = Number(id);
  if (!incidentId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const body = await req.json().catch(() => null);

  const status = body?.status as string | undefined;
  const action = body?.action as string | undefined;
  const assignTo = typeof body?.assignTo === "string" ? body.assignTo.trim() : undefined;
  const gerencia = typeof body?.gerencia === "string" ? body.gerencia.trim() : undefined;
  const motivoServicio = typeof body?.motivoServicio === "string" ? body.motivoServicio.trim() : undefined;
  const accionTomada = typeof body?.accionTomada === "string" ? body.accionTomada.trim() : undefined;
  const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim() : undefined;
  const primerContacto = typeof body?.primerContacto === "boolean" ? body.primerContacto : undefined;
  const requestedReportDate = typeof body?.fechaReporte === "string" ? body.fechaReporte.trim() : undefined;
  const requestedReportTime = typeof body?.horaReporte === "string" ? body.horaReporte.trim() : undefined;
  const requestedTakeDate = typeof body?.fechaToma === "string" ? body.fechaToma.trim() : undefined;
  const requestedTakeTime = typeof body?.horaToma === "string" ? body.horaToma.trim() : undefined;
  const requestedResolutionDate =
    typeof body?.fechaRespuesta === "string" ? body.fechaRespuesta.trim() : undefined;
  const requestedResolutionTime =
    typeof body?.horaRespuesta === "string" ? body.horaRespuesta.trim() : undefined;
  const mode = body?.mode === "resolution-edit" ? "resolution-edit" : "standard";
  const wantsManualTimelineEdit =
    mode === "resolution-edit" &&
    (
      requestedReportDate !== undefined ||
      requestedReportTime !== undefined ||
      requestedTakeDate !== undefined ||
      requestedTakeTime !== undefined ||
      requestedResolutionDate !== undefined ||
      requestedResolutionTime !== undefined
    );

  const allowedStatus = ["REGISTRADO", "EN_ATENCION", "RESPONDIDO", "RESUELTO"];
  if (status && !allowedStatus.includes(status)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  if (requestedResolutionDate !== undefined && requestedResolutionDate !== "" && !isValidDateInput(requestedResolutionDate)) {
    return NextResponse.json({ error: "Fecha de resolución inválida" }, { status: 400 });
  }

  if (requestedReportDate !== undefined && requestedReportDate !== "" && !isValidDateInput(requestedReportDate)) {
    return NextResponse.json({ error: "Fecha de reporte inválida" }, { status: 400 });
  }

  if (requestedReportTime !== undefined && requestedReportTime !== "" && !isValidTimeInput(requestedReportTime)) {
    return NextResponse.json({ error: "Hora de reporte inválida" }, { status: 400 });
  }

  if (requestedTakeDate !== undefined && requestedTakeDate !== "" && !isValidDateInput(requestedTakeDate)) {
    return NextResponse.json({ error: "Fecha de toma inválida" }, { status: 400 });
  }

  if (requestedTakeTime !== undefined && requestedTakeTime !== "" && !isValidTimeInput(requestedTakeTime)) {
    return NextResponse.json({ error: "Hora de toma inválida" }, { status: 400 });
  }

  if (requestedResolutionTime !== undefined && requestedResolutionTime !== "" && !isValidTimeInput(requestedResolutionTime)) {
    return NextResponse.json({ error: "Hora de resolución inválida" }, { status: 400 });
  }

  const incident = await getIncidentSecurityRow(incidentId);
  if (!incident) {
    return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  }

  const actorName = getActorName(auth);

  if (action === "take") {
    if (!canAccessTicket(auth, incident, "queue")) {
      return NextResponse.json({ error: "No puedes tomar este ticket" }, { status: 403 });
    }
  } else if (!canAccessTicket(auth, incident, "manage")) {
    return NextResponse.json({ error: "No puedes gestionar este ticket" }, { status: 403 });
  }

  if (incident.estado === "RESUELTO" && !wantsManualTimelineEdit) {
    return NextResponse.json(
      { error: "El ticket ya fue resuelto y no admite más gestión ni reasignaciones" },
      { status: 400 }
    );
  }

  const updates: string[] = [];
  const values: Array<string | number | boolean> = [];

  if (action === "take") {
    const takenAt = new Date();
    const takenAtParts = getLaPazDateTimeParts(takenAt);
    updates.push(`encargado = $${values.length + 1}`);
    values.push(actorName);
    updates.push(`estado = $${values.length + 1}`);
    values.push("EN_ATENCION");
    if (!incident.fecha_toma || !incident.hora_toma) {
      updates.push(`fecha_toma = $${values.length + 1}`);
      values.push(takenAtParts.fecha);
      updates.push(`hora_toma = $${values.length + 1}`);
      values.push(takenAtParts.hora);
    }
  }

  if (action === "reassign") {
    if (!assignTo) return NextResponse.json({ error: "Asignación requerida" }, { status: 400 });
    const assignee = await resolveSupportAssignee(assignTo);
    if (!assignee) {
      return NextResponse.json({ error: "Usuario de soporte inválido" }, { status: 400 });
    }
    updates.push(`encargado = $${values.length + 1}`);
    values.push(assignee);
  }

  if (gerencia) {
    updates.push(`gerencia = $${values.length + 1}`);
    values.push(gerencia);
  }

  if (motivoServicio) {
    updates.push(`motivo_servicio = $${values.length + 1}`);
    values.push(motivoServicio);
  }

  if (accionTomada) {
    updates.push(`accion_tomada = $${values.length + 1}`);
    values.push(accionTomada);
  }

  if (descripcion) {
    updates.push(`descripcion = $${values.length + 1}`);
    values.push(descripcion);
  }

  if (typeof primerContacto === "boolean") {
    updates.push(`primer_contacto = $${values.length + 1}`);
    values.push(primerContacto);
  }

  const resolvingNow = status === "RESUELTO" && incident.estado !== "RESUELTO";
  const shouldUseManualResolution =
    status === "RESUELTO" &&
    mode === "resolution-edit" &&
    Boolean(requestedResolutionDate) &&
    Boolean(requestedResolutionTime);
  const resolvedAt = resolvingNow && !shouldUseManualResolution ? new Date() : null;
  const resolvedAtParts = resolvedAt ? getLaPazDateTimeParts(resolvedAt) : null;
  const reportDate = mode === "resolution-edit" ? requestedReportDate || incident.fecha_reporte : incident.fecha_reporte;
  const reportTime =
    mode === "resolution-edit" && requestedReportTime
      ? normalizeTimeInput(requestedReportTime)
      : incident.hora_reporte;
  const takeDate = mode === "resolution-edit" ? requestedTakeDate || incident.fecha_toma : incident.fecha_toma;
  const takeTime =
    mode === "resolution-edit" && requestedTakeTime
      ? normalizeTimeInput(requestedTakeTime)
      : incident.hora_toma;
  const resolvedDate = shouldUseManualResolution
    ? requestedResolutionDate || incident.fecha_respuesta
    : resolvedAtParts
      ? resolvedAtParts.fecha
      : incident.fecha_respuesta;
  const resolvedTime = shouldUseManualResolution
    ? normalizeTimeInput(requestedResolutionTime || incident.hora_respuesta || "")
    : resolvedAtParts
      ? resolvedAtParts.hora
      : incident.hora_respuesta;

  if (mode === "resolution-edit" && status === "RESUELTO" && (!resolvedDate || !resolvedTime)) {
    return NextResponse.json(
      { error: "Debes completar fecha y hora de resolución para tickets resueltos" },
      { status: 400 }
    );
  }

  if (mode === "resolution-edit" && ((requestedReportDate && !requestedReportTime) || (!requestedReportDate && requestedReportTime))) {
    return NextResponse.json(
      { error: "Debes completar fecha y hora de reporte para ajustar manualmente el reporte del ticket" },
      { status: 400 }
    );
  }

  if (mode === "resolution-edit" && ((requestedTakeDate && !requestedTakeTime) || (!requestedTakeDate && requestedTakeTime))) {
    return NextResponse.json(
      { error: "Debes completar fecha y hora de toma para ajustar manualmente la toma del ticket" },
      { status: 400 }
    );
  }

  if (mode === "resolution-edit" && reportDate && reportTime) {
    const reportedAt = toComparableDate(reportDate, reportTime);
    if (Number.isNaN(reportedAt.getTime())) {
      return NextResponse.json({ error: "No se pudo validar el reporte indicado" }, { status: 400 });
    }
  }

  if (mode === "resolution-edit" && takeDate && takeTime) {
    const takenAt = toComparableDate(takeDate, takeTime);
    if (Number.isNaN(takenAt.getTime())) {
      return NextResponse.json({ error: "No se pudo validar la toma indicada" }, { status: 400 });
    }
  }

  if (mode === "resolution-edit" && resolvedDate && resolvedTime && takeDate && takeTime) {
    const takenAt = toComparableDate(takeDate, takeTime);
    const resolvedAtDate = toComparableDate(resolvedDate, resolvedTime);
    if (Number.isNaN(takenAt.getTime()) || Number.isNaN(resolvedAtDate.getTime())) {
      return NextResponse.json({ error: "No se pudo validar la resolución indicada" }, { status: 400 });
    }
    if (resolvedAtDate < takenAt) {
      return NextResponse.json(
        { error: "La resolución no puede ser anterior a la fecha y hora de toma del ticket" },
        { status: 400 }
      );
    }
  }

  if (mode === "resolution-edit" && reportDate && reportTime) {
    updates.push(`fecha_reporte = $${values.length + 1}`);
    values.push(reportDate);
    updates.push(`hora_reporte = $${values.length + 1}`);
    values.push(reportTime);
  }

  if (mode === "resolution-edit" && takeDate && takeTime) {
    updates.push(`fecha_toma = $${values.length + 1}`);
    values.push(takeDate);
    updates.push(`hora_toma = $${values.length + 1}`);
    values.push(takeTime);
  }

  if (resolvingNow || (mode === "resolution-edit" && status === "RESUELTO" && resolvedDate && resolvedTime)) {
    updates.push(`fecha_respuesta = $${values.length + 1}`);
    values.push(resolvedDate || "");
    updates.push(`hora_respuesta = $${values.length + 1}`);
    values.push(resolvedTime || "");
  }

  if (status) {
    updates.push(`estado = $${values.length + 1}`);
    values.push(status);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
  }

  updates.push(`last_updated_at = now()`);

  values.push(incidentId);
  const updateResult = await db.query(
    `UPDATE incidents
     SET ${updates.join(", ")}
     WHERE id = $${values.length}
     RETURNING id, estado, encargado, clasificacion, tiempo_minutos, categoria, porcentaje, regla_porcentaje, fecha_reporte, hora_reporte, fecha_toma, hora_toma, fecha_respuesta, hora_respuesta`,
    values
  );

  let result = updateResult;

  if ((status === "RESUELTO" || updateResult.rows[0]?.estado === "RESUELTO")) {
    const kpiResult = await db.query(
      `WITH calc AS (
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
         WHERE id = $1
           AND fecha_toma IS NOT NULL
           AND hora_toma IS NOT NULL
           AND fecha_respuesta IS NOT NULL
           AND hora_respuesta IS NOT NULL
           AND (fecha_respuesta::timestamp + hora_respuesta) >= (fecha_toma::timestamp + hora_toma)
       )
       UPDATE incidents i
       SET
         tiempo_minutos = calc.diff_minutes,
         categoria = CASE
           WHEN calc.diff_minutes < 60 THEN 'Menos de 1 hora'
           WHEN calc.diff_minutes < 120 THEN '1 - 2 horas'
           WHEN calc.diff_minutes < 240 THEN '2 - 4 horas'
           ELSE 'Más de 4 horas'
         END,
         porcentaje = CASE
           WHEN calc.diff_minutes < 60 THEN 100
           WHEN calc.diff_minutes < 120 THEN 75
           WHEN calc.diff_minutes < 240 THEN 50
           ELSE 25
         END,
         regla_porcentaje = CASE
           WHEN calc.diff_minutes < 60 THEN '< 1 hora = 100%'
           WHEN calc.diff_minutes < 120 THEN '1 - 2 horas = 75%'
           WHEN calc.diff_minutes < 240 THEN '2 - 4 horas = 50%'
           ELSE '> 4 horas = 25%'
         END,
         mes_atencion = TO_CHAR(i.fecha_respuesta, 'YYYY-MM')
       FROM calc
       WHERE i.id = calc.id
       RETURNING i.id, i.estado, i.encargado, i.clasificacion, i.tiempo_minutos, i.categoria, i.porcentaje, i.regla_porcentaje, i.fecha_reporte, i.hora_reporte, i.fecha_toma, i.hora_toma, i.fecha_respuesta, i.hora_respuesta`,
      [incidentId]
    );

    if (kpiResult.rowCount > 0) {
      result = kpiResult;
    }
  }

  if (status || action === "take") {
    const logStatus = status || "EN_ATENCION";
    await db.query(
      "INSERT INTO status_logs (incident_id, estado, changed_by) VALUES ($1, $2, $3)",
      [incidentId, logStatus, auth.userId]
    );
  }

  return NextResponse.json({ item: result.rows[0] });
}
