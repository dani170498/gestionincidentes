import { cookies } from "next/headers";
import { authCookieName, verifyJwt } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Role } from "@/lib/rbac";

type DbUserRow = {
  id: number;
  username: string;
  full_name: string | null;
  role: Role;
  active: boolean;
};

type DbRoleRow = {
  role: Role;
};

type IncidentSecurityRow = {
  id: number;
  estado: string;
  encargado: string;
  primer_contacto: boolean;
  fecha_reporte: string;
  hora_reporte: string;
};

export type AuthContext = {
  userId: number;
  username: string;
  fullName: string | null;
  roles: Role[];
};

export type TicketPermission = "queue" | "manage" | "actions";

function uniqueRoles(roles: Role[]): Role[] {
  return Array.from(new Set(roles));
}

export function hasAnyRole(auth: AuthContext, allowed: Role[]): boolean {
  return allowed.some((role) => auth.roles.includes(role));
}

export function getActorName(auth: AuthContext): string {
  return auth.fullName || auth.username;
}

export async function requireAuthContext(): Promise<AuthContext | null> {
  const jar = await cookies();
  const token = jar.get(authCookieName)?.value;
  const payload = token ? verifyJwt(token) : null;
  if (!payload?.sub) return null;

  const userResult = (await db.query(
    "SELECT id, username, full_name, role, active FROM users WHERE id = $1",
    [Number(payload.sub)]
  )) as { rowCount: number; rows: DbUserRow[] };
  if (userResult.rowCount === 0) return null;

  const user = userResult.rows[0];
  if (!user.active) return null;

  const rolesResult = (await db.query("SELECT role FROM user_roles WHERE user_id = $1", [user.id])) as {
    rowCount: number;
    rows: DbRoleRow[];
  };
  const roles = uniqueRoles(
    rolesResult.rowCount > 0 ? rolesResult.rows.map((row: DbRoleRow) => row.role) : [user.role]
  );

  return {
    userId: user.id,
    username: user.username,
    fullName: user.full_name,
    roles,
  };
}

export async function requireRoles(allowed: Role[]): Promise<AuthContext | null> {
  const auth = await requireAuthContext();
  if (!auth) return null;
  if (!hasAnyRole(auth, allowed)) return null;
  return auth;
}

export async function getIncidentSecurityRow(incidentId: number): Promise<IncidentSecurityRow | null> {
  const result = (await db.query(
    "SELECT id, estado, encargado, primer_contacto, fecha_reporte, hora_reporte FROM incidents WHERE id = $1",
    [incidentId]
  )) as { rowCount: number; rows: IncidentSecurityRow[] };
  if (result.rowCount === 0) return null;
  return result.rows[0];
}

export function canAccessTicket(auth: AuthContext, incident: IncidentSecurityRow, permission: TicketPermission): boolean {
  if (hasAnyRole(auth, ["ADMIN", "SUPERVISOR"])) return true;
  if (!hasAnyRole(auth, ["SOPORTE"])) return false;

  const actorName = getActorName(auth);
  if (permission === "queue") {
    return incident.encargado === "SIN_ASIGNAR";
  }

  return incident.encargado === actorName;
}
