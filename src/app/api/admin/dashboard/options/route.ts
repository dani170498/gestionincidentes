import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActorName, hasAnyRole, requireRoles } from "@/lib/security";

export async function GET() {
  const auth = await requireRoles(["SOPORTE", "SUPERVISOR", "ADMIN"]);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const [serviceTypes, channels, gerencias, motivos, assignees] = await Promise.all([
    db.query("SELECT name FROM catalog_service_types WHERE active = true ORDER BY name ASC"),
    db.query("SELECT name FROM catalog_channels WHERE active = true ORDER BY name ASC"),
    db.query("SELECT name FROM catalog_gerencias WHERE active = true ORDER BY name ASC"),
    db.query("SELECT name FROM catalog_motivos WHERE active = true ORDER BY name ASC"),
    hasAnyRole(auth, ["SUPERVISOR", "ADMIN"])
      ? db.query(
          `SELECT DISTINCT COALESCE(u.full_name, u.username) AS name
           FROM users u
           LEFT JOIN user_roles ur ON ur.user_id = u.id
           WHERE u.active = true
             AND (u.role = 'SOPORTE' OR ur.role = 'SOPORTE')
           ORDER BY name ASC`
        )
      : Promise.resolve({ rows: [{ name: getActorName(auth) }] }),
  ]);

  return NextResponse.json({
    statuses: ["REGISTRADO", "EN_ATENCION", "RESPONDIDO", "RESUELTO"],
    tipoRegistro: ["INCIDENTE", "SOPORTE"],
    primerContacto: [
      { value: "true", label: "Sí" },
      { value: "false", label: "No" },
    ],
    serviceTypes: serviceTypes.rows.map((row: { name: string }) => row.name),
    channels: channels.rows.map((row: { name: string }) => row.name),
    gerencias: gerencias.rows.map((row: { name: string }) => row.name),
    motivos: motivos.rows.map((row: { name: string }) => row.name),
    assignees: assignees.rows.map((row: { name: string | null }) => row.name).filter(Boolean),
  });
}
