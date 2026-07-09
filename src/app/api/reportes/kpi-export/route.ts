import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getResolvedTicketsReport } from "@/lib/reportes";
import { requireRoles } from "@/lib/security";

export const runtime = "nodejs";

function runPythonExport(inputPath: string, outputPath: string) {
  return new Promise<void>((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "scripts", "reporting", "export_kpi_report.py");
    const pythonBinary = process.env.KPI_REPORT_PYTHON || "python3";
    const child = spawn(pythonBinary, [scriptPath, inputPath, outputPath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `El generador Python terminó con código ${code}`));
    });
  });
}

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
  const tempBase = path.join(os.tmpdir(), `kpi-report-${randomUUID()}`);
  const inputPath = `${tempBase}.json`;
  const outputPath = `${tempBase}.xlsx`;

  try {
    await writeFile(
      inputPath,
      JSON.stringify({
        meta: report.meta,
        items: report.items,
      }),
      "utf8"
    );

    await runPythonExport(inputPath, outputPath);

    const fileBuffer = await readFile(outputPath);
    const filename = `reporte_kpi_${fechaDesde}_a_${fechaHasta}.xlsx`;

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar el reporte KPI";
    const details = message.includes("No module named 'xlsxwriter'")
      ? `${message}. Instala dependencias con: pip install -r scripts/reporting/requirements.txt`
      : message;
    return NextResponse.json({ error: details }, { status: 500 });
  } finally {
    await Promise.allSettled([rm(inputPath, { force: true }), rm(outputPath, { force: true })]);
  }
}
