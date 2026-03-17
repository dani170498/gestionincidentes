import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authCookieName } from "./src/lib/auth";
import type { Role } from "./src/lib/auth";

const PROTECTED_PREFIXES = ["/incidentes", "/soporte", "/admin"];
const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
};

function withSecurityHeaders(response: NextResponse) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

type MiddlewareJwtPayload = {
  roles?: Role[];
  role?: Role;
  exp?: number;
};

function decodeJwtPayload(token: string): MiddlewareJwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payloadPart = parts[1];
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json) as MiddlewareJwtPayload;
    if (typeof parsed.exp === "number" && parsed.exp * 1000 < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!isProtected) return withSecurityHeaders(NextResponse.next());

  const token = req.cookies.get(authCookieName)?.value;
  const payload = token ? decodeJwtPayload(token) : null;
  if (!token || !payload) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return withSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  if (pathname.startsWith("/admin")) {
    const roles = payload.roles && payload.roles.length ? payload.roles : payload.role ? [payload.role] : [];
    const allow = (allowed: Role[]) => allowed.some((r) => roles.includes(r));
    if (pathname.startsWith("/admin/catalogos") || pathname.startsWith("/admin/usuarios")) {
      if (!allow(["ADMIN"])) return withSecurityHeaders(NextResponse.redirect(new URL("/no-autorizado", req.url)));
    } else if (pathname.startsWith("/admin/importar")) {
      if (!allow(["ADMIN"])) return withSecurityHeaders(NextResponse.redirect(new URL("/no-autorizado", req.url)));
    } else if (pathname.startsWith("/admin/resueltos")) {
      if (!allow(["SUPERVISOR", "ADMIN"])) {
        return withSecurityHeaders(NextResponse.redirect(new URL("/no-autorizado", req.url)));
      }
    } else if (pathname.startsWith("/admin/graficos")) {
      if (!allow(["SOPORTE", "SUPERVISOR", "ADMIN"])) {
        return withSecurityHeaders(NextResponse.redirect(new URL("/no-autorizado", req.url)));
      }
    } else if (pathname.startsWith("/admin/mis-tickets")) {
      if (!allow(["SOPORTE", "SUPERVISOR", "ADMIN"])) {
        return withSecurityHeaders(NextResponse.redirect(new URL("/no-autorizado", req.url)));
      }
    } else if (pathname.startsWith("/admin/en-proceso")) {
      if (!allow(["SOPORTE", "SUPERVISOR", "ADMIN"])) {
        return withSecurityHeaders(NextResponse.redirect(new URL("/no-autorizado", req.url)));
      }
    }
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/incidentes/:path*", "/soporte/:path*", "/admin/:path*"],
};
