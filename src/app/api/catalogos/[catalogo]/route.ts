import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publishCatalogEvent } from "@/lib/webhooks";
import { getDuplicateMessage, isUniqueViolation } from "@/lib/pg-errors";

const catalogMap: Record<string, { table: string; label: string; hasServiceType?: boolean }> = {
  tiposervicio: { table: "catalog_service_types", label: "Tipo de servicio" },
  canaloficina: { table: "catalog_channels", label: "Canal/Oficina" },
  gerencia: { table: "catalog_gerencias", label: "Gerencia" },
  motivo: { table: "catalog_motivos", label: "Motivo", hasServiceType: true },
  categoria: { table: "catalog_categorias", label: "Categoría" },
};

function getCatalog(key: string) {
  return catalogMap[key];
}

export async function GET(req: Request, { params }: { params: Promise<{ catalogo: string }> }) {
  const { catalogo } = await params;
  const catalog = getCatalog(catalogo);
  if (!catalog) return NextResponse.json({ error: "Catálogo inválido" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("all") === "1";

  const baseSelect = catalog.hasServiceType
    ? `SELECT id, name, active, service_type_id FROM ${catalog.table}`
    : `SELECT id, name, active FROM ${catalog.table}`;
  const query = includeInactive
    ? `${baseSelect} ORDER BY name ASC`
    : `${baseSelect} WHERE active = true ORDER BY name ASC`;

  const result = await db.query(query);
  return NextResponse.json({ items: result.rows, label: catalog.label });
}

export async function POST(req: Request, { params }: { params: Promise<{ catalogo: string }> }) {
  const { catalogo } = await params;
  const catalog = getCatalog(catalogo);
  if (!catalog) return NextResponse.json({ error: "Catálogo inválido" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

  if (catalog.hasServiceType) {
    const serviceTypeId = Number(body?.serviceTypeId);
    if (!serviceTypeId) {
      return NextResponse.json({ error: "Tipo de servicio requerido" }, { status: 400 });
    }
    try {
      const result = await db.query(
        `INSERT INTO ${catalog.table} (name, service_type_id, active) VALUES ($1, $2, true) RETURNING id, name, active, service_type_id`,
        [name, serviceTypeId]
      );
      await publishCatalogEvent({
        catalogo,
        action: "create",
        item: result.rows[0],
      });
      return NextResponse.json({ item: result.rows[0] }, { status: 201 });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return NextResponse.json({ error: getDuplicateMessage(error, "El catálogo ya existe") }, { status: 409 });
      }
      throw error;
    }
  }

  try {
    const result = await db.query(
      `INSERT INTO ${catalog.table} (name, active) VALUES ($1, true) RETURNING id, name, active`,
      [name]
    );

    await publishCatalogEvent({
      catalogo,
      action: "create",
      item: result.rows[0],
    });
    return NextResponse.json({ item: result.rows[0] }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: getDuplicateMessage(error, "El catálogo ya existe") }, { status: 409 });
    }
    throw error;
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ catalogo: string }> }) {
  const { catalogo } = await params;
  const catalog = getCatalog(catalogo);
  if (!catalog) return NextResponse.json({ error: "Catálogo inválido" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const updates: string[] = [];
  const values: Array<string | boolean | number> = [];

  if (typeof body.name === "string") {
    values.push(body.name.trim());
    updates.push(`name = $${values.length}`);
  }
  if (catalog.hasServiceType && typeof body.serviceTypeId === "number") {
    values.push(body.serviceTypeId);
    updates.push(`service_type_id = $${values.length}`);
  }
  if (typeof body.active === "boolean") {
    values.push(body.active);
    updates.push(`active = $${values.length}`);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
  }

  values.push(id);
  const returning = catalog.hasServiceType ? "id, name, active, service_type_id" : "id, name, active";
  try {
    const result = await db.query(
      `UPDATE ${catalog.table} SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING ${returning}`,
      values
    );

    const action =
      typeof body.active === "boolean" ? (body.active ? "activate" : "deactivate") : "update";
    await publishCatalogEvent({
      catalogo,
      action,
      item: result.rows[0],
    });
    return NextResponse.json({ item: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: getDuplicateMessage(error, "El catálogo ya existe") }, { status: 409 });
    }
    throw error;
  }
}
