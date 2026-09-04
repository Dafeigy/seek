import { NextResponse } from "next/server";
import { expiredSessionCookie, revokeRequestSession } from "@/lib/auth";

export async function POST(request: Request) {
  await revokeRequestSession(request);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(expiredSessionCookie());
  return response;
}
