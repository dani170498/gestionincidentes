import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

export type Role = "SOLICITANTE" | "SOPORTE" | "SUPERVISOR" | "ADMIN";

export type JwtPayload = {
  sub: string;
  roles: Role[];
  role?: Role;
};

const JWT_SECRET = process.env.JWT_SECRET || "";
const COOKIE_NAME = "auth_token";
// Keep cookie non-secure by default to allow HTTP environments (VM/local reverse proxy without TLS).
// Enable explicitly with COOKIE_SECURE=true when HTTPS is configured.
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

export function signJwt(payload: JwtPayload): string {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not set");
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
}

export function verifyJwt(token: string): JwtPayload | null {
  if (!JWT_SECRET) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function getAuthFromRequest(req: NextRequest): JwtPayload | null {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyJwt(token);
}

export const authCookieName = COOKIE_NAME;
export const authCookieSecure = COOKIE_SECURE;
