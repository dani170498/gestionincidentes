import { NextResponse } from "next/server";
import { authCookieName, authCookieSecure } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(authCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: authCookieSecure,
    path: "/",
    maxAge: 0,
  });
  return res;
}
