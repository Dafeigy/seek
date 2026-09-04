import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  return session ? NextResponse.json(session) : NextResponse.json({ error: "未登录" }, { status: 401 });
}
