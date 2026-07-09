import { NextResponse } from "next/server";
import { getResolvedTicketsReport } from "@/lib/reportes";
import { requireRoles } from "@/lib/security";

export async function GET(req: Request) {
  const auth = await requireRoles(["SOPORTE", "SUPERVISOR", "ADMIN"]);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const fechaDesde = searchParams.get("fechaDesde");
  const fechaHasta = searchParams.get("fechaHasta");

  if (!fechaDesde || !fechaHasta) {
    return NextResponse.json({ error: "Debes indicar fechaDesde y fechaHasta" }, { status: 400 });
  }

  if (fechaDesde > fechaHasta) {
    return NextResponse.json({ error: "La fecha inicial no puede ser mayor a la fecha final" }, { status: 400 });
  }

  const report = await getResolvedTicketsReport(auth, fechaDesde, fechaHasta);
  return NextResponse.json(report);
}
