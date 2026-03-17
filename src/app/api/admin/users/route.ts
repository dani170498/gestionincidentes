import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { authCookieName, verifyJwt } from "@/lib/auth";
import { getDuplicateMessage, isUniqueViolation } from "@/lib/pg-errors";

async function requireAdmin() {
  const jar = await cookies();
  const token = jar.get(authCookieName)?.value;
  const payload = token ? verifyJwt(token) : null;
  const roles = payload?.roles && payload.roles.length ? payload.roles : payload?.role ? [payload.role] : [];
  if (!payload || !roles.includes("ADMIN")) return null;
  return payload;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const result = await db.query(
    `SELECT u.id, u.username, u.full_name, u.email, u.role, u.active, u.created_at,
            COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), ARRAY[]::text[]) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     GROUP BY u.id
     ORDER BY u.created_at DESC`
  );
  return NextResponse.json({ items: result.rows });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const username = body?.username?.trim();
  const fullName = body?.full_name?.trim();
  const email = body?.email?.trim();
  const role = body?.role;
  const roles: string[] = Array.isArray(body?.roles) ? body.roles : [];
  const password = body?.password;

  if (!username || !fullName || !email || !role || !password) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 12);
  const baseRole = roles[0] || role;
  try {
    const result = await db.query(
      "INSERT INTO users (username, full_name, email, role, password_hash, active) VALUES ($1, $2, $3, $4, $5, true) RETURNING id, username, full_name, email, role, active, created_at",
      [username, fullName, email, baseRole, hash]
    );
    if (roles.length > 0) {
      for (const r of roles) {
        await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
          result.rows[0].id,
          r,
        ]);
      }
    }
    return NextResponse.json({ item: result.rows[0] }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: getDuplicateMessage(error, "El usuario ya existe") }, { status: 409 });
    }
    throw error;
  }
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const updates: string[] = [];
  const values: Array<string | boolean | number> = [];

  if (typeof body.username === "string") {
    values.push(body.username.trim());
    updates.push(`username = $${values.length}`);
  }
  if (typeof body.full_name === "string") {
    values.push(body.full_name.trim());
    updates.push(`full_name = $${values.length}`);
  }
  if (typeof body.email === "string") {
    values.push(body.email.trim());
    updates.push(`email = $${values.length}`);
  }
  const hasRolesArray = Array.isArray(body.roles);
  if (typeof body.role === "string" && !hasRolesArray) {
    values.push(body.role);
    updates.push(`role = $${values.length}`);
  }
  if (hasRolesArray) {
    await db.query("DELETE FROM user_roles WHERE user_id = $1", [id]);
    for (const r of body.roles) {
      await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
        id,
        r,
      ]);
    }
    if (body.roles[0]) {
      values.push(body.roles[0]);
      updates.push(`role = $${values.length}`);
    }
  }
  if (typeof body.active === "boolean") {
    values.push(body.active);
    updates.push(`active = $${values.length}`);
  }
  if (typeof body.password === "string" && body.password.length > 0) {
    const hash = await bcrypt.hash(body.password, 12);
    values.push(hash);
    updates.push(`password_hash = $${values.length}`);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
  }

  values.push(id);
  try {
    const result = await db.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING id, username, full_name, email, role, active, created_at`,
      values
    );
    return NextResponse.json({ item: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: getDuplicateMessage(error, "Datos duplicados") }, { status: 409 });
    }
    throw error;
  }
}
