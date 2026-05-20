import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { combineLaPazDateTime, findExternalTicketById, isExternalAuthorized } from "@/lib/external-ticket";
import { mapExternalStatus } from "@/lib/external-status";
import { getLaPazIsoString } from "@/lib/utils";

type TimelineEvent = {
  id: string;
  occurredAt: string;
  type: "REPORT" | "TAKE" | "STATUS_CHANGE" | "WORKLOG" | "RESOLUTION";
  status?: string;
  statusCode?: string;
  actor: string;
  text: string;
};

export async function GET(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  if (!isExternalAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { ticketId } = await params;
  const normalizedTicketId = ticketId.trim();
  if (!normalizedTicketId) {
    return NextResponse.json({ error: "ticketId requerido" }, { status: 400 });
  }

  const ticket = await findExternalTicketById(normalizedTicketId);
  if (!ticket) {
    return NextResponse.json({ error: "ticketId no encontrado" }, { status: 404 });
  }

  const [statusLogs, actions] = await Promise.all([
    db.query(
      `SELECT sl.id, sl.estado, sl.changed_at, COALESCE(u.full_name, u.username, 'Sistema') AS actor
       FROM status_logs sl
       LEFT JOIN users u ON u.id = sl.changed_by
       WHERE sl.incident_id = $1
       ORDER BY sl.changed_at ASC`,
      [ticket.id]
    ),
    db.query(
      `SELECT ta.id, ta.action_text, ta.created_at, COALESCE(u.full_name, u.username, 'Sistema') AS actor
       FROM ticket_actions ta
       LEFT JOIN users u ON u.id = ta.created_by
       WHERE ta.incident_id = $1
       ORDER BY ta.created_at ASC`,
      [ticket.id]
    ),
  ]);

  const events: TimelineEvent[] = [];

  const reportedAt = combineLaPazDateTime(ticket.fecha_reporte, ticket.hora_reporte);
  if (reportedAt) {
    events.push({
      id: `report-${ticket.id}`,
      occurredAt: reportedAt,
      type: "REPORT",
      status: "REGISTRADO",
      statusCode: mapExternalStatus("REGISTRADO"),
      actor: ticket.solicitante,
      text: `Ticket reportado por ${ticket.solicitante}.`,
    });
  }

  const takenAt = combineLaPazDateTime(ticket.fecha_toma, ticket.hora_toma);
  if (takenAt) {
    events.push({
      id: `take-${ticket.id}`,
      occurredAt: takenAt,
      type: "TAKE",
      status: "EN_ATENCION",
      statusCode: mapExternalStatus("EN_ATENCION"),
      actor: ticket.encargado || "Sistema",
      text: `Ticket tomado por ${ticket.encargado || "Sistema"}.`,
    });
  }

  for (const row of statusLogs.rows) {
    events.push({
      id: `status-${row.id}`,
      occurredAt: row.changed_at instanceof Date ? getLaPazIsoString(row.changed_at) : String(row.changed_at),
      type: "STATUS_CHANGE",
      status: row.estado,
      statusCode: mapExternalStatus(row.estado),
      actor: row.actor,
      text: `Estado actualizado a ${row.estado.replaceAll("_", " ")}.`,
    });
  }

  for (const row of actions.rows) {
    events.push({
      id: `action-${row.id}`,
      occurredAt: row.created_at instanceof Date ? getLaPazIsoString(row.created_at) : String(row.created_at),
      type: "WORKLOG",
      actor: row.actor,
      text: row.action_text,
    });
  }

  const resolvedAt = combineLaPazDateTime(ticket.fecha_respuesta, ticket.hora_respuesta);
  if (resolvedAt) {
    events.push({
      id: `resolution-${ticket.id}`,
      occurredAt: resolvedAt,
      type: "RESOLUTION",
      status: "RESUELTO",
      statusCode: mapExternalStatus("RESUELTO"),
      actor: ticket.encargado || "Sistema",
      text: ticket.accion_tomada || "Ticket resuelto.",
    });
  }

  events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  return NextResponse.json({
    ok: true,
    ticketId: ticket.external_id || String(ticket.id),
    internalId: ticket.id,
    currentStatus: ticket.estado,
    currentStatusCode: mapExternalStatus(ticket.estado),
    events,
  });
}
