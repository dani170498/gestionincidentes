import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessTicket, getIncidentSecurityRow, requireRoles } from "@/lib/security";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["SOPORTE", "SUPERVISOR", "ADMIN"]);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const incidentId = Number(id);
  if (!incidentId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const incident = await getIncidentSecurityRow(incidentId);
  if (!incident) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  if (!canAccessTicket(auth, incident, "actions")) {
    return NextResponse.json({ error: "No autorizado para ver acciones de este ticket" }, { status: 403 });
  }

  const result = await db.query(
    `SELECT ta.id, ta.incident_id, ta.action_text, ta.created_at,
            COALESCE(u.full_name, u.username, 'Sistema') AS created_by_name
     FROM ticket_actions ta
     LEFT JOIN users u ON u.id = ta.created_by
     WHERE ta.incident_id = $1
     ORDER BY ta.created_at ASC`,
    [incidentId]
  );

  return NextResponse.json({ items: result.rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["SOPORTE", "SUPERVISOR", "ADMIN"]);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const incidentId = Number(id);
  if (!incidentId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const actionText = body?.actionText?.trim();
  if (!actionText) {
    return NextResponse.json({ error: "Acción requerida" }, { status: 400 });
  }

  const incident = await getIncidentSecurityRow(incidentId);
  if (!incident) {
    return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  }
  if (!canAccessTicket(auth, incident, "actions")) {
    return NextResponse.json({ error: "No autorizado para registrar acciones en este ticket" }, { status: 403 });
  }
  if (incident.encargado === "SIN_ASIGNAR") {
    return NextResponse.json(
      { error: "El ticket debe ser tomado antes de registrar acciones" },
      { status: 400 }
    );
  }

  const result = await db.query(
    `INSERT INTO ticket_actions (incident_id, action_text, created_by)
     VALUES ($1, $2, $3)
     RETURNING id, incident_id, action_text, created_at`,
    [incidentId, actionText, auth.userId]
  );

  await db.query("UPDATE incidents SET last_updated_at = now() WHERE id = $1", [incidentId]);

  return NextResponse.json({ item: result.rows[0] }, { status: 201 });
}
