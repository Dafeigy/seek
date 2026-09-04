import { NextResponse } from "next/server";
import { acceptInvitation, sessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { token?: unknown; password?: unknown; displayName?: unknown };
  try {
    const sessionToken = await acceptInvitation({ token: body.token, password: body.password, displayName: body.displayName });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookie(sessionToken));
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法接受邀请" }, { status: 400 });
  }
}
