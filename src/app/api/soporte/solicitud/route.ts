import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authCookieName, verifyJwt } from "@/lib/auth";
import { db } from "@/lib/db";

const GERENCIA_PENDIENTE = "PENDIENTE_DEFINIR";

function toDateParts(date: Date) {
  const iso = date.toISOString();
  return {
    fecha: iso.slice(0, 10),
    hora: iso.slice(11, 16),
  };
}

function monthFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function categoriaPorTiempo(minutes: number): string {
  if (minutes < 60) return "Menos de 1 hora";
  if (minutes < 120) return "1 - 2 horas";
  if (minutes < 240) return "2 - 4 horas";
  return "Más de 4 horas";
}

function porcentajePorTiempo(minutes: number): { porcentaje: number; regla: string } {
  if (minutes < 60) return { porcentaje: 100, regla: "< 1 hora = 100%" };
  if (minutes < 120) return { porcentaje: 75, regla: "1 - 2 horas = 75%" };
  if (minutes < 240) return { porcentaje: 50, regla: "2 - 4 horas = 50%" };
  return { porcentaje: 25, regla: "> 4 horas = 25%" };
}

type RequesterAuth =
  | { mode: "user"; userId: string }
  | { mode: "apiKey" }
  | null;

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

  const tipoServicio = body?.tipoServicio?.trim();
  const canalOficina = body?.canalOficina?.trim();
  const descripcion = body?.descripcion?.trim();
  const bodySolicitante = body?.solicitante?.trim();

  if (!tipoServicio || !canalOficina || !descripcion) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
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
  const diffMinutes = 0;
  const monthAttention = monthFromDate(createdAt);
  const categoria = categoriaPorTiempo(diffMinutes);
  const { porcentaje, regla } = porcentajePorTiempo(diffMinutes);

  await db.query(
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
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
    )`,
    [
      "SOPORTE",
      solicitante,
      tipoServicio,
      canalOficina,
      GERENCIA_PENDIENTE,
      "SIN_MOTIVO",
      descripcion,
      encargado,
      fecha,
      hora,
      fecha,
      hora,
      "PENDIENTE",
      false,
      diffMinutes,
      monthAttention,
      categoria,
      porcentaje,
      regla,
      "REGISTRADO",
      createdAt,
    ]
  );

  return NextResponse.json({ ok: true });
}
