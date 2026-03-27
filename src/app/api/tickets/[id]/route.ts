import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessTicket, getActorName, getIncidentSecurityRow, requireRoles } from "@/lib/security";

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
  const accionTomada = typeof body?.accionTomada === "string" ? body.accionTomada.trim() : undefined;
  const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim() : undefined;
  const fechaRespuesta = typeof body?.fechaRespuesta === "string" ? body.fechaRespuesta.trim() : undefined;
  const horaRespuesta = typeof body?.horaRespuesta === "string" ? body.horaRespuesta.trim() : undefined;
  const primerContacto = typeof body?.primerContacto === "boolean" ? body.primerContacto : undefined;

  const allowedStatus = ["REGISTRADO", "EN_ATENCION", "RESPONDIDO", "RESUELTO"];
  if (status && !allowedStatus.includes(status)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
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

  const updates: string[] = [];
  const values: Array<string | number | boolean> = [];

  if (action === "take") {
    updates.push(`encargado = $${values.length + 1}`);
    values.push(actorName);
    updates.push(`estado = $${values.length + 1}`);
    values.push("EN_ATENCION");
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

  if (fechaRespuesta) {
    updates.push(`fecha_respuesta = $${values.length + 1}`);
    values.push(fechaRespuesta);
  }
  if (horaRespuesta) {
    updates.push(`hora_respuesta = $${values.length + 1}`);
    values.push(horaRespuesta);
  }

  const reportDate = incident.fecha_reporte;
  const reportTime = incident.hora_reporte;
  const nextDate = fechaRespuesta || reportDate;
  const nextTime = horaRespuesta || reportTime;
  const start = new Date(`${reportDate}T${reportTime}`);
  const end = new Date(`${nextDate}T${nextTime}`);
  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end.getTime() >= start.getTime()) {
    const diffMinutes = Math.floor((end.getTime() - start.getTime()) / 60000);
    const categoria =
      diffMinutes < 60 ? "Menos de 1 hora" : diffMinutes < 120 ? "1 - 2 horas" : diffMinutes < 240 ? "2 - 4 horas" : "Más de 4 horas";
    const porcentaje = diffMinutes < 60 ? 100 : diffMinutes < 120 ? 75 : diffMinutes < 240 ? 50 : 25;
    const regla =
      diffMinutes < 60 ? "< 1 hora = 100%" : diffMinutes < 120 ? "1 - 2 horas = 75%" : diffMinutes < 240 ? "2 - 4 horas = 50%" : "> 4 horas = 25%";
    updates.push(`tiempo_minutos = $${values.length + 1}`);
    values.push(diffMinutes);
    updates.push(`categoria = $${values.length + 1}`);
    values.push(categoria);
    updates.push(`porcentaje = $${values.length + 1}`);
    values.push(porcentaje);
    updates.push(`regla_porcentaje = $${values.length + 1}`);
    values.push(regla);
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
  const result = await db.query(
    `UPDATE incidents SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING id, estado, encargado, clasificacion`,
    values
  );

  if (status || action === "take") {
    const logStatus = status || "EN_ATENCION";
    await db.query(
      "INSERT INTO status_logs (incident_id, estado, changed_by) VALUES ($1, $2, $3)",
      [incidentId, logStatus, auth.userId]
    );
  }

  return NextResponse.json({ item: result.rows[0] });
}
