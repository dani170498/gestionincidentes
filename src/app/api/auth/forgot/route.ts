import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "crypto";
import { getDuplicateMessage, isUniqueViolation } from "@/lib/pg-errors";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = body?.username?.trim();

  if (!username) {
    return NextResponse.json({ error: "Usuario requerido" }, { status: 400 });
  }

  const user = await db.query("SELECT id FROM users WHERE username = $1 AND active = true", [username]);
  if (user.rowCount === 0) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

  try {
    await db.query(
      "INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [user.rows[0].id, token, expires]
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: getDuplicateMessage(error, "No se pudo generar el token") }, { status: 409 });
    }
    throw error;
  }

  // En un sistema real, se enviaría por email/SMS.
  return NextResponse.json({ ok: true, token });
}
