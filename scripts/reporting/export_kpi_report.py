#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import xlsxwriter


def format_datetime(date_value: str | None, time_value: str | None) -> str:
    if not date_value:
        return "--"

    date_part = date_value.split("T", 1)[0]
    time_part = ""
    if time_value:
        time_part = time_value.split(".", 1)[0]
    elif "T" in date_value:
        time_part = date_value.split("T", 1)[1].split(".", 1)[0]
    hhmm = time_part[:5] if time_part else "00:00"
    return f"{date_part} {hhmm}"


def build_series(items: list[dict[str, Any]], key: str, fallback: str = "Sin dato") -> list[tuple[str, int]]:
    counter = Counter()
    for item in items:
        value = item.get(key)
        label = str(value).strip() if value is not None else ""
        counter[label or fallback] += 1
    return counter.most_common()


def build_time_series(items: list[dict[str, Any]]) -> list[tuple[str, int]]:
    buckets = [
        ("Menos de 1 hora", 0),
        ("1 - 2 horas", 0),
        ("2 - 4 horas", 0),
        ("Mas de 4 horas", 0),
        ("Sin tiempo", 0),
    ]

    for item in items:
        minutes = item.get("tiempo_minutos")
        if minutes is None:
            buckets[4] = (buckets[4][0], buckets[4][1] + 1)
        elif minutes < 60:
            buckets[0] = (buckets[0][0], buckets[0][1] + 1)
        elif minutes < 120:
            buckets[1] = (buckets[1][0], buckets[1][1] + 1)
        elif minutes < 240:
            buckets[2] = (buckets[2][0], buckets[2][1] + 1)
        else:
            buckets[3] = (buckets[3][0], buckets[3][1] + 1)

    return [bucket for bucket in buckets if bucket[1] > 0]


def average_resolution_minutes(items: list[dict[str, Any]]) -> float:
    values = [item["tiempo_minutos"] for item in items if item.get("tiempo_minutos") is not None]
    if not values:
        return 0.0
    return sum(values) / len(values)


def write_chart_block(
    worksheet: xlsxwriter.worksheet.Worksheet,
    workbook: xlsxwriter.Workbook,
    title: str,
    start_row: int,
    start_col: int,
    rows: list[tuple[str, int]],
    color: str,
) -> int:
    title_fmt = workbook.add_format({
        "bold": True,
        "font_size": 12,
        "font_color": "#16324F",
    })
    table_header_fmt = workbook.add_format({
        "bold": True,
        "bg_color": "#D9EAF7",
        "border": 1,
        "font_color": "#16324F",
    })
    label_fmt = workbook.add_format({"border": 1})
    value_fmt = workbook.add_format({"border": 1, "align": "center"})

    worksheet.write(start_row, start_col, title, title_fmt)
    header_row = start_row + 1
    worksheet.write(header_row, start_col, "Categoria", table_header_fmt)
    worksheet.write(header_row, start_col + 1, "Total", table_header_fmt)

    for index, (label, total) in enumerate(rows, start=1):
        worksheet.write(header_row + index, start_col, label, label_fmt)
        worksheet.write_number(header_row + index, start_col + 1, total, value_fmt)

    chart = workbook.add_chart({"type": "bar"})
    last_data_row = header_row + max(len(rows), 1)
    chart.add_series({
        "name": title,
        "categories": ["Resumen KPI", header_row + 1, start_col, last_data_row, start_col],
        "values": ["Resumen KPI", header_row + 1, start_col + 1, last_data_row, start_col + 1],
        "fill": {"color": color},
        "border": {"color": color},
        "data_labels": {"value": True},
    })
    chart.set_title({"name": title})
    chart.set_legend({"none": True})
    chart.set_chartarea({"border": {"none": True}})
    chart.set_plotarea({"border": {"none": True}})
    chart.set_x_axis({"major_gridlines": {"visible": False}})
    chart.set_y_axis({"reverse": True})
    chart.set_size({"width": 620, "height": max(240, 70 + len(rows) * 28)})
    chart.set_style(10)

    worksheet.insert_chart(start_row, start_col + 3, chart, {"x_offset": 10, "y_offset": 4})

    return max(12, len(rows) + 4)


def build_workbook(payload: dict[str, Any], output_path: Path) -> None:
    meta = payload["meta"]
    items = payload["items"]

    workbook = xlsxwriter.Workbook(output_path.as_posix())
    detail_sheet = workbook.add_worksheet("Detalle")
    summary_sheet = workbook.add_worksheet("Resumen KPI")

    title_fmt = workbook.add_format({
        "bold": True,
        "font_size": 18,
        "font_color": "#16324F",
    })
    subtitle_fmt = workbook.add_format({
        "font_size": 10,
        "font_color": "#4B5D70",
    })
    card_label_fmt = workbook.add_format({
        "bold": True,
        "font_size": 10,
        "bg_color": "#D9EAF7",
        "border": 1,
        "font_color": "#16324F",
    })
    card_value_fmt = workbook.add_format({
        "font_size": 16,
        "bold": True,
        "align": "center",
        "valign": "vcenter",
        "border": 1,
        "bg_color": "#F7FBFE",
        "font_color": "#0B4F6C",
    })
    header_fmt = workbook.add_format({
        "bold": True,
        "bg_color": "#16324F",
        "font_color": "#FFFFFF",
        "border": 1,
        "text_wrap": True,
        "valign": "top",
    })
    text_fmt = workbook.add_format({"border": 1, "valign": "top"})
    center_fmt = workbook.add_format({"border": 1, "align": "center", "valign": "top"})

    detail_sheet.freeze_panes(1, 0)
    detail_sheet.autofilter(0, 0, max(len(items), 1), 18)
    detail_sheet.set_zoom(90)
    summary_sheet.set_zoom(90)

    columns = [
        ("ID", 8),
        ("Tipo registro", 16),
        ("Solicitante", 22),
        ("Tipo servicio", 22),
        ("Canal / Oficina", 18),
        ("Gerencia", 18),
        ("Motivo servicio", 22),
        ("Descripcion", 40),
        ("Encargado", 22),
        ("Reporte", 18),
        ("Toma", 18),
        ("Resolucion", 18),
        ("Accion tomada", 30),
        ("Primer contacto", 16),
        ("Tiempo minutos", 16),
        ("Mes atencion", 14),
        ("Categoria", 16),
        ("Porcentaje", 12),
        ("Estado", 14),
    ]

    for col_index, (label, width) in enumerate(columns):
        detail_sheet.write(0, col_index, label, header_fmt)
        detail_sheet.set_column(col_index, col_index, width)

    for row_index, item in enumerate(items, start=1):
        detail_sheet.write_number(row_index, 0, item["id"], center_fmt)
        detail_sheet.write(row_index, 1, item["tipo_registro"], text_fmt)
        detail_sheet.write(row_index, 2, item["solicitante"], text_fmt)
        detail_sheet.write(row_index, 3, item["tipo_servicio"], text_fmt)
        detail_sheet.write(row_index, 4, item["canal_oficina"], text_fmt)
        detail_sheet.write(row_index, 5, item["gerencia"], text_fmt)
        detail_sheet.write(row_index, 6, item["motivo_servicio"], text_fmt)
        detail_sheet.write(row_index, 7, item["descripcion"], text_fmt)
        detail_sheet.write(row_index, 8, item["encargado"], text_fmt)
        detail_sheet.write(row_index, 9, format_datetime(item["fecha_reporte"], item["hora_reporte"]), center_fmt)
        detail_sheet.write(row_index, 10, format_datetime(item["fecha_toma"], item["hora_toma"]), center_fmt)
        detail_sheet.write(row_index, 11, format_datetime(item["fecha_respuesta"], item["hora_respuesta"]), center_fmt)
        detail_sheet.write(row_index, 12, item.get("accion_tomada") or "", text_fmt)
        detail_sheet.write(row_index, 13, "Si" if item["primer_contacto"] else "No", center_fmt)
        detail_sheet.write(row_index, 14, item["tiempo_minutos"] if item["tiempo_minutos"] is not None else "", center_fmt)
        detail_sheet.write(row_index, 15, item.get("mes_atencion") or "", center_fmt)
        detail_sheet.write(row_index, 16, item.get("categoria") or "", center_fmt)
        detail_sheet.write(row_index, 17, item["porcentaje"] if item["porcentaje"] is not None else "", center_fmt)
        detail_sheet.write(row_index, 18, item["estado"], center_fmt)

    summary_sheet.set_column(0, 1, 18)
    summary_sheet.set_column(3, 4, 18)
    summary_sheet.set_column(6, 7, 18)
    summary_sheet.set_column(9, 10, 18)

    summary_sheet.write("A1", "Reporte KPI de tickets", title_fmt)
    summary_sheet.write("A2", f"Rango: {meta['fechaDesde']} a {meta['fechaHasta']}", subtitle_fmt)
    summary_sheet.write("A3", "Resumen ejecutivo para seguimiento gerencial", subtitle_fmt)

    total_items = len(items)
    resolved_items = sum(1 for item in items if item.get("estado") == "RESUELTO")
    first_contact_items = sum(1 for item in items if item.get("primer_contacto"))
    avg_minutes = average_resolution_minutes(items)

    cards = [
        ("Total tickets", total_items),
        ("Resueltos", resolved_items),
        ("Primer contacto", first_contact_items),
        ("Promedio minutos", int(math.floor(avg_minutes)) if avg_minutes else 0),
    ]

    for index, (label, value) in enumerate(cards):
        col = index * 3
        summary_sheet.merge_range(4, col, 4, col + 1, label, card_label_fmt)
        summary_sheet.merge_range(5, col, 7, col + 1, value, card_value_fmt)

    service_rows = build_series(items, "tipo_servicio")
    reason_rows = build_series(items, "motivo_servicio")
    channel_rows = build_series(items, "canal_oficina")
    time_rows = build_time_series(items)

    next_row = 10
    next_row += write_chart_block(summary_sheet, workbook, "Tickets por tipo de servicio", next_row, 0, service_rows, "#1F77B4")
    next_row += 1
    next_row += write_chart_block(summary_sheet, workbook, "Tickets por motivo de servicio", next_row, 0, reason_rows, "#FF7F0E")
    next_row += 1
    next_row += write_chart_block(summary_sheet, workbook, "Tickets por canal de atencion", next_row, 0, channel_rows, "#2CA02C")
    next_row += 1
    write_chart_block(summary_sheet, workbook, "Tiempo de respuesta", next_row, 0, time_rows, "#9467BD")

    workbook.close()


def main() -> int:
    if len(sys.argv) != 3:
        print("Uso: export_kpi_report.py <input.json> <output.xlsx>", file=sys.stderr)
        return 1

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    build_workbook(payload, output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
