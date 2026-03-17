import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authCookieName, verifyJwt } from "@/lib/auth";
import { db } from "@/lib/db";

async function requireSupportRoles() {
  const jar = await cookies();
  const token = jar.get(authCookieName)?.value;
  const payload = token ? verifyJwt(token) : null;
  const roles = payload?.roles && payload.roles.length ? payload.roles : payload?.role ? [payload.role] : [];
  if (!payload) return null;
  if (!roles.includes("SOPORTE") && !roles.includes("SUPERVISOR") && !roles.includes("ADMIN")) return null;
  return payload;
}

export async function GET() {
  const auth = await requireSupportRoles();
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const result = await db.query(
    `SELECT DISTINCT u.id, u.full_name, u.username
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     WHERE u.active = true
       AND (u.role = 'SOPORTE' OR ur.role = 'SOPORTE')
     ORDER BY u.full_name ASC, u.username ASC`
  );

  const items = result.rows.map((row: { id: number; full_name: string | null; username: string }) => ({
    id: row.id,
    name: row.full_name || row.username,
  }));

  return NextResponse.json({ items });
}
