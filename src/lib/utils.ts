import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LA_PAZ_TIME_ZONE = "America/La_Paz";

function getTimeZonePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function getLaPazDateTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LA_PAZ_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const year = getTimeZonePart(parts, "year");
  const month = getTimeZonePart(parts, "month");
  const day = getTimeZonePart(parts, "day");
  const hour = getTimeZonePart(parts, "hour");
  const minute = getTimeZonePart(parts, "minute");
  const second = getTimeZonePart(parts, "second");

  return {
    fecha: `${year}-${month}-${day}`,
    hora: `${hour}:${minute}:${second}`,
    horaMinutos: `${hour}:${minute}`,
  };
}

export function getLaPazIsoString(date = new Date()) {
  const { fecha, hora } = getLaPazDateTimeParts(date);
  return `${fecha}T${hora}-04:00`;
}
