import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authCookieName, authCookieSecure, signJwt } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = body?.username?.trim();
  const password = body?.password;

  if (!username || !password) {
    return NextResponse.json({ error: "Usuario y contraseña son requeridos" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    return NextResponse.json({ error: "Servidor no configurado" }, { status: 500 });
  }

  const result = await db.query(
    "SELECT id, username, password_hash, role, full_name FROM users WHERE username = $1 AND active = true",
    [username]
  );

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  const user = result.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  const rolesResult = await db.query("SELECT role FROM user_roles WHERE user_id = $1", [user.id]);
  const roles =
    rolesResult.rowCount > 0
      ? rolesResult.rows.map((r: { role: string }) => r.role)
      : [user.role];
  const token = signJwt({ sub: String(user.id), roles });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(authCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: authCookieSecure,
    path: "/",
  });

  return res;
}
