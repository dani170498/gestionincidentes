import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { authCookieName, verifyJwt } from "@/lib/auth";
import { getDuplicateMessage, isUniqueViolation } from "@/lib/pg-errors";

async function isAuthorized(req: Request): Promise<boolean> {
  const apiKey = req.headers.get("x-api-key") || "";
  const expected = process.env.EXTERNAL_API_KEY || "";
  if (expected && apiKey === expected) return true;

  const jar = await cookies();
  const token = jar.get(authCookieName)?.value;
  if (!token) return false;
  const payload = verifyJwt(token);
  return Boolean(payload);
}

function toDateTime(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value;
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

function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

function validatePayload(body: any) {
  const required = [
    "external_id",
    "tipo_registro",
    "solicitante",
    "tipo_servicio",
    "canal_oficina",
    "gerencia",
    "motivo_servicio",
    "descripcion",
    "encargado",
    "fecha_reporte",
    "hora_reporte",
    "fecha_respuesta",
    "hora_respuesta",
    "accion_tomada",
    "primer_contacto",
  ];
  for (const field of required) {
    if (!Object.prototype.hasOwnProperty.call(body ?? {}, field) || isMissing(body?.[field])) {
      return `Campo requerido: ${field}`;
    }
  }
  return null;
}

async function resolveCatalogIdValue(
  value: unknown,
  table: string,
  label: string
): Promise<{ name: string; id: number } | { error: string }> {
  if (typeof value !== "number") {
    return { error: `${label} debe ser un id numérico` };
  }
  if (!Number.isFinite(value) || value <= 0) return { error: `${label} inválido` };
  const result = await db.query(`SELECT id, name FROM ${table} WHERE id = $1`, [value]);
  if (result.rowCount === 0) return { error: `${label} no encontrado` };
  return { name: result.rows[0].name, id: result.rows[0].id };
}

async function resolveMotivoId(
  value: unknown,
  tipoServicioId: number
): Promise<{ name: string; id: number } | { error: string }> {
  if (typeof value !== "number") {
    return { error: "motivo_servicio debe ser un id numérico" };
  }
  if (!Number.isFinite(value) || value <= 0) return { error: "motivo_servicio inválido" };
  const result = await db.query(
    "SELECT id, name, service_type_id FROM catalog_motivos WHERE id = $1",
    [value]
  );
  if (result.rowCount === 0) return { error: "motivo_servicio no encontrado" };
  const row = result.rows[0];
  if (row.service_type_id !== tipoServicioId) {
    return { error: "motivo_servicio no corresponde al tipo_servicio" };
  }
  return { name: row.name, id: row.id };
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  const validation = validatePayload(body);
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });

  const resolvedTipoServicio = await resolveCatalogIdValue(
    body.tipo_servicio,
    "catalog_service_types",
    "tipo_servicio"
  );
  if ("error" in resolvedTipoServicio) {
    return NextResponse.json({ error: resolvedTipoServicio.error }, { status: 400 });
  }

  const resolvedCanal = await resolveCatalogIdValue(body.canal_oficina, "catalog_channels", "canal_oficina");
  if ("error" in resolvedCanal) {
    return NextResponse.json({ error: resolvedCanal.error }, { status: 400 });
  }

  const resolvedGerencia = await resolveCatalogIdValue(body.gerencia, "catalog_gerencias", "gerencia");
  if ("error" in resolvedGerencia) {
    return NextResponse.json({ error: resolvedGerencia.error }, { status: 400 });
  }

  const resolvedMotivo = await resolveMotivoId(body.motivo_servicio, resolvedTipoServicio.id);
  if ("error" in resolvedMotivo) {
    return NextResponse.json({ error: resolvedMotivo.error }, { status: 400 });
  }

  const start = toDateTime(body.fecha_reporte, body.hora_reporte);
  const end = toDateTime(body.fecha_respuesta, body.hora_respuesta);
  if (!start || !end) return NextResponse.json({ error: "Fecha/hora inválida" }, { status: 400 });
  if (end.getTime() < start.getTime()) {
    return NextResponse.json({ error: "Respuesta anterior al reporte" }, { status: 400 });
  }

  const diffMinutes = Math.floor((end.getTime() - start.getTime()) / 60000);
  const createdAt = new Date();
  const monthAttention = monthFromDate(createdAt);
  const categoria = categoriaPorTiempo(diffMinutes);
  const { porcentaje, regla } = porcentajePorTiempo(diffMinutes);

  const tipoRegistro = body.tipo_registro === "SOPORTE" ? "SOPORTE" : "INCIDENTE";
  const status = body.estado || (body.primer_contacto ? "RESUELTO" : "REGISTRADO");

  let result;
  try {
    result = await db.query(
      `INSERT INTO incidents (
        external_id,
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
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
      ) RETURNING id`,
      [
        body.external_id,
        tipoRegistro,
        body.solicitante,
        resolvedTipoServicio.name,
        resolvedCanal.name,
        resolvedGerencia.name,
        resolvedMotivo.name,
        body.descripcion,
        body.encargado,
        body.fecha_reporte,
        body.hora_reporte,
        body.fecha_respuesta,
        body.hora_respuesta,
        body.accion_tomada,
        body.primer_contacto === true || body.primer_contacto === "SI",
        diffMinutes,
        monthAttention,
        categoria,
        porcentaje,
        regla,
        status,
        createdAt,
      ]
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: getDuplicateMessage(error, "El ticket externo ya existe") }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({
    ok: true,
    id: result.rows[0].id,
    resolved: {
      tipo_servicio: resolvedTipoServicio.name,
      canal_oficina: resolvedCanal.name,
      gerencia: resolvedGerencia.name,
      motivo_servicio: resolvedMotivo.name,
    },
  });
}

export async function PUT(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  const validation = validatePayload(body);
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });

  const resolvedTipoServicio = await resolveCatalogIdValue(
    body.tipo_servicio,
    "catalog_service_types",
    "tipo_servicio"
  );
  if ("error" in resolvedTipoServicio) {
    return NextResponse.json({ error: resolvedTipoServicio.error }, { status: 400 });
  }

  const resolvedCanal = await resolveCatalogIdValue(body.canal_oficina, "catalog_channels", "canal_oficina");
  if ("error" in resolvedCanal) {
    return NextResponse.json({ error: resolvedCanal.error }, { status: 400 });
  }

  const resolvedGerencia = await resolveCatalogIdValue(body.gerencia, "catalog_gerencias", "gerencia");
  if ("error" in resolvedGerencia) {
    return NextResponse.json({ error: resolvedGerencia.error }, { status: 400 });
  }

  const resolvedMotivo = await resolveMotivoId(body.motivo_servicio, resolvedTipoServicio.id);
  if ("error" in resolvedMotivo) {
    return NextResponse.json({ error: resolvedMotivo.error }, { status: 400 });
  }

  const start = toDateTime(body.fecha_reporte, body.hora_reporte);
  const end = toDateTime(body.fecha_respuesta, body.hora_respuesta);
  if (!start || !end) return NextResponse.json({ error: "Fecha/hora inválida" }, { status: 400 });
  if (end.getTime() < start.getTime()) {
    return NextResponse.json({ error: "Respuesta anterior al reporte" }, { status: 400 });
  }

  const diffMinutes = Math.floor((end.getTime() - start.getTime()) / 60000);
  const monthAttention = monthFromDate(new Date());
  const categoria = categoriaPorTiempo(diffMinutes);
  const { porcentaje, regla } = porcentajePorTiempo(diffMinutes);
  const tipoRegistro = body.tipo_registro === "SOPORTE" ? "SOPORTE" : "INCIDENTE";
  const status = body.estado || (body.primer_contacto ? "RESUELTO" : "REGISTRADO");

  const result = await db.query(
    `UPDATE incidents SET
      tipo_registro = $2,
      solicitante = $3,
      tipo_servicio = $4,
      canal_oficina = $5,
      gerencia = $6,
      motivo_servicio = $7,
      descripcion = $8,
      encargado = $9,
      fecha_reporte = $10,
      hora_reporte = $11,
      fecha_respuesta = $12,
      hora_respuesta = $13,
      accion_tomada = $14,
      primer_contacto = $15,
      tiempo_minutos = $16,
      mes_atencion = $17,
      categoria = $18,
      porcentaje = $19,
      regla_porcentaje = $20,
      estado = $21
     WHERE external_id = $1
     RETURNING id`,
    [
      body.external_id,
      tipoRegistro,
      body.solicitante,
      resolvedTipoServicio.name,
      resolvedCanal.name,
      resolvedGerencia.name,
      resolvedMotivo.name,
      body.descripcion,
      body.encargado,
      body.fecha_reporte,
      body.hora_reporte,
      body.fecha_respuesta,
      body.hora_respuesta,
      body.accion_tomada,
      body.primer_contacto === true || body.primer_contacto === "SI",
      diffMinutes,
      monthAttention,
      categoria,
      porcentaje,
      regla,
      status,
    ]
  );

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "external_id no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    id: result.rows[0].id,
    resolved: {
      tipo_servicio: resolvedTipoServicio.name,
      canal_oficina: resolvedCanal.name,
      gerencia: resolvedGerencia.name,
      motivo_servicio: resolvedMotivo.name,
    },
  });
}
