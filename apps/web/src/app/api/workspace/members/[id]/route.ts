import { NextResponse } from "next/server";

import { getRequestSession, removeWorkspaceMember, resetWorkspaceMemberPassword, updateWorkspaceMemberRole } from "@/lib/auth";

function canManageMembers(role: string) {
  return role === "owner" || role === "admin";
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canManageMembers(session.role)) return NextResponse.json({ error: "无权管理成员" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { role?: unknown };
  try {
    await updateWorkspaceMemberRole(session, id, body.role);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新成员失败" }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canManageMembers(session.role)) return NextResponse.json({ error: "无权管理成员" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { password?: unknown };
  try {
    await resetWorkspaceMemberPassword(session, id, body.password);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "重置密码失败" }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canManageMembers(session.role)) return NextResponse.json({ error: "无权管理成员" }, { status: 403 });
  const { id } = await params;
  try {
    await removeWorkspaceMember(session, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除成员失败" }, { status: 400 });
  }
}
