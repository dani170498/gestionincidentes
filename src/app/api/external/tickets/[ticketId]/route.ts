import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { combineLaPazDateTime, findExternalTicketById, isExternalAuthorized } from "@/lib/external-ticket";
import { mapExternalStatus } from "@/lib/external-status";
import { getLaPazIsoString } from "@/lib/utils";

type TicketActionRow = {
  id: number;
  action_text: string;
  created_at: Date | string;
  created_by: string;
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

  const item = await findExternalTicketById(normalizedTicketId);
  if (!item) {
    return NextResponse.json({ error: "ticketId no encontrado" }, { status: 404 });
  }

  const actionsResult = await db.query(
    `SELECT ta.id, ta.action_text, ta.created_at, COALESCE(u.full_name, u.username, 'Sistema') AS created_by
     FROM ticket_actions ta
     LEFT JOIN users u ON u.id = ta.created_by
     WHERE ta.incident_id = $1
     ORDER BY ta.created_at ASC`,
    [item.id]
  ) as { rows: TicketActionRow[] };

  const actions = actionsResult.rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at instanceof Date ? getLaPazIsoString(row.created_at) : String(row.created_at),
    createdBy: row.created_by,
    text: row.action_text,
  }));

  return NextResponse.json({
    ok: true,
    ticket: {
      ticketId: item.external_id || String(item.id),
      status: item.estado,
      statusCode: mapExternalStatus(item.estado),
      tipoRegistro: item.tipo_registro,
      solicitante: item.solicitante,
      tipoServicio: item.tipo_servicio,
      canalOficina: item.canal_oficina,
      gerencia: item.gerencia,
      motivoServicio: item.motivo_servicio,
      descripcion: item.descripcion,
      encargado: item.encargado,
      createdAt: item.created_at,
      lastUpdatedAt: item.last_updated_at,
      timestamps: {
        reportedAt: combineLaPazDateTime(item.fecha_reporte, item.hora_reporte),
        takenAt: combineLaPazDateTime(item.fecha_toma, item.hora_toma),
        resolvedAt: combineLaPazDateTime(item.fecha_respuesta, item.hora_respuesta),
      },
      actions,
    },
  });
}
