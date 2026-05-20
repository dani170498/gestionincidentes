import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActorName, requireAuthContext } from "@/lib/security";
import { getLaPazDateTimeParts } from "@/lib/utils";

function toDateParts(date: Date) {
  return getLaPazDateTimeParts(date);
}

export async function POST(req: Request) {
  const auth = await requireAuthContext();
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  const requiredFields = [
    "tipoRegistro",
    "solicitante",
    "tipoServicio",
    "canalOficina",
    "gerencia",
    "motivoServicio",
    "descripcion",
    "fechaReporte",
    "horaReporte",
  ];

  for (const field of requiredFields) {
    if (!body[field]) {
      return NextResponse.json({ error: `Campo requerido: ${field}` }, { status: 400 });
    }
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL no configurado" }, { status: 500 });
  }

  const tipoRegistro = body.tipoRegistro === "SOPORTE" ? "SOPORTE" : "INCIDENTE";
  if (!body.fechaReporte || !body.horaReporte) {
    return NextResponse.json({ error: "Fecha/hora inválida" }, { status: 400 });
  }
  const createdAt = new Date();
  const takenAt = toDateParts(createdAt);
  const status = "EN_ATENCION";

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
    )`,
    [
      tipoRegistro,
      body.solicitante,
      body.tipoServicio,
      body.canalOficina,
      body.gerencia,
      body.motivoServicio,
      body.descripcion,
      getActorName(auth),
      body.fechaReporte,
      body.horaReporte,
      takenAt.fecha,
      takenAt.hora,
      null,
      null,
      null,
      false,
      null,
      null,
      null,
      null,
      null,
      status,
      createdAt,
    ]
  );

  return NextResponse.json({ ok: true });
}
