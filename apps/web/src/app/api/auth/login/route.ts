import { NextResponse } from "next/server";
import { sessionCookie, signIn } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { email?: unknown; password?: unknown };
  const token = await signIn(body.email, body.password);
  if (!token) return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie(token));
  return response;
}
