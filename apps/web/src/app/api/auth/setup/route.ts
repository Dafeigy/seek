import { NextResponse } from "next/server";
import { createInitialOwner, sessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { email?: unknown; password?: unknown; displayName?: unknown; workspaceName?: unknown };
  try {
    const token = await createInitialOwner({ email: body.email, password: body.password, displayName: body.displayName, workspaceName: body.workspaceName });
    const response = NextResponse.json({ ok: true }, { status: 201 });
    response.cookies.set(sessionCookie(token));
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "初始化失败" }, { status: 400 });
  }
}
