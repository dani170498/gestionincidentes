import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authCookieName, verifyJwt } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const jar = await cookies();
  const token = jar.get(authCookieName)?.value;
  if (!token) return NextResponse.json({ user: null });
  const payload = verifyJwt(token);
  if (!payload) return NextResponse.json({ user: null });

  const result = await db.query(
    "SELECT id, username, full_name, role FROM users WHERE id = $1",
    [payload.sub]
  );
  if (result.rowCount === 0) return NextResponse.json({ user: null });
  const rolesResult = await db.query("SELECT role FROM user_roles WHERE user_id = $1", [payload.sub]);
  const roles =
    rolesResult.rowCount > 0
      ? rolesResult.rows.map((r: { role: string }) => r.role)
      : [result.rows[0].role];
  return NextResponse.json({ user: { ...result.rows[0], roles } });
}
