import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authCookieName, verifyJwt } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLaPazDateTimeParts } from "@/lib/utils";

const GERENCIA_PENDIENTE = "PENDIENTE_DEFINIR";

function toDateParts(date: Date) {
  return getLaPazDateTimeParts(date);
}

type RequesterAuth =
  | { mode: "user"; userId: string }
  | { mode: "apiKey" }
  | null;

async function resolveCatalogValue(
  value: unknown,
  table: string,
  label: string
): Promise<{ name: string; id?: number } | { error: string }> {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return { error: `${label} inválido` };
    const result = await db.query(`SELECT id, name FROM ${table} WHERE id = $1 AND active = true`, [value]);
    if (result.rowCount === 0) return { error: `${label} no encontrado` };
    return { id: result.rows[0].id, name: result.rows[0].name };
  }

  if (typeof value !== "string") {
    return { error: `${label} requerido` };
  }

  const trimmed = value.trim();
  if (!trimmed) return { error: `${label} requerido` };

  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed);
    const result = await db.query(`SELECT id, name FROM ${table} WHERE id = $1 AND active = true`, [id]);
    if (result.rowCount === 0) return { error: `${label} no encontrado` };
    return { id: result.rows[0].id, name: result.rows[0].name };
  }

  return { name: trimmed };
}

async function authorizeRequester(req: Request): Promise<RequesterAuth> {
  const apiKey = req.headers.get("x-api-key") || "";
  const expected = process.env.EXTERNAL_API_KEY || "";
  if (expected && apiKey === expected) return { mode: "apiKey" };

  const jar = await cookies();
  const token = jar.get(authCookieName)?.value;
  const payload = token ? verifyJwt(token) : null;
  if (!payload?.sub) return null;

  return { mode: "user", userId: payload.sub };
}

export async function POST(req: Request) {
  const auth = await authorizeRequester(req);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  const descripcion = body?.descripcion?.trim();
  const bodySolicitante = body?.solicitante?.trim();

  if (body?.tipoServicio == null || body?.canalOficina == null || !descripcion) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  const tipoServicio = await resolveCatalogValue(body.tipoServicio, "catalog_service_types", "tipoServicio");
  if ("error" in tipoServicio) {
    return NextResponse.json({ error: tipoServicio.error }, { status: 400 });
  }

  const canalOficina = await resolveCatalogValue(body.canalOficina, "catalog_channels", "canalOficina");
  if ("error" in canalOficina) {
    return NextResponse.json({ error: canalOficina.error }, { status: 400 });
  }

  let solicitante = bodySolicitante || "";
  if (auth.mode === "user") {
    const user = await db.query("SELECT full_name, username FROM users WHERE id = $1", [auth.userId]);
    if (user.rowCount === 0) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    solicitante = user.rows[0].full_name || user.rows[0].username;
  } else if (!solicitante) {
    return NextResponse.json({ error: "Campo requerido: solicitante" }, { status: 400 });
  }

  const encargado = "SIN_ASIGNAR";
  const createdAt = new Date();
  const { fecha, hora } = toDateParts(createdAt);

  const client = await db.connect();
  let createdId: number | null = null;
  let ticketId: string | null = null;

  try {
    await client.query("BEGIN");

    const insertResult = await client.query(
      `INSERT INTO incidents (
        tipo_registro,
        solicitante,
        tipo_servicio,
        canal_oficina,
        gerencia,
        motivo_servicio,
        descripcion,
        encargado,
        fecha_reporte,
        hora_reporte,
        fecha_toma,
        hora_toma,
        fecha_respuesta,
        hora_respuesta,
        accion_tomada,
        primer_contacto,
        tiempo_minutos,
        mes_atencion,
        categoria,
        porcentaje,
        regla_porcentaje,
        estado,
        created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
      )
      RETURNING id`,
      [
        "SOPORTE",
        solicitante,
        tipoServicio.name,
        canalOficina.name,
        GERENCIA_PENDIENTE,
        "SIN_MOTIVO",
        descripcion,
        encargado,
        fecha,
        hora,
        null,
        null,
        null,
        null,
        null,
        false,
        null,
        null,
        null,
        null,
        null,
        "REGISTRADO",
        createdAt,
      ]
    );

    createdId = insertResult.rows[0]?.id ?? null;
    ticketId = createdId ? String(createdId) : null;

    if (!createdId || !ticketId) {
      throw new Error("No se pudo generar el ticketId");
    }

    await client.query("UPDATE incidents SET external_id = $1 WHERE id = $2", [ticketId, createdId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return NextResponse.json({
    ok: true,
    ticketId,
  });
}
