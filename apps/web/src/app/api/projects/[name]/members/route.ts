import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth";
import { db } from "@/lib/server-db";

const projectRoles = ["admin", "editor", "commenter", "viewer"] as const;

async function canManageProject(userId: string, projectName: string, workspaceRole: string) {
  if (workspaceRole === "owner" || workspaceRole === "admin") return true;
  const [member] = await db`select role from project_members where project_name = ${projectName} and user_id = ${userId} and role = 'admin'`;
  return Boolean(member);
}

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { name } = await params;
  if (!(await canManageProject(session.userId, name, session.role))) return NextResponse.json({ error: "无权管理项目成员" }, { status: 403 });
  const members = await db`
    select u.id, u.email, u.display_name, pm.role, pm.created_at
    from project_members pm join users u on u.id = pm.user_id
    where pm.project_name = ${name}
    order by case pm.role when 'admin' then 0 when 'editor' then 1 when 'commenter' then 2 else 3 end, u.email
  `;
  return NextResponse.json(members.map((member) => ({ id: member.id, email: member.email, displayName: member.display_name, role: member.role, addedAt: member.created_at })));
}

export async function PUT(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { name } = await params;
  if (!(await canManageProject(session.userId, name, session.role))) return NextResponse.json({ error: "无权管理项目成员" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { userId?: unknown; role?: unknown };
  if (typeof body.userId !== "string" || !projectRoles.includes(body.role as typeof projectRoles[number])) return NextResponse.json({ error: "成员或角色无效" }, { status: 400 });
  const role = body.role as typeof projectRoles[number];
  const [workspaceMember] = await db`select 1 from workspace_members where workspace_id = ${session.workspaceId} and user_id = ${body.userId}`;
  if (!workspaceMember) return NextResponse.json({ error: "该用户不属于当前 Workspace" }, { status: 400 });
  await db`insert into project_members (project_name, user_id, role) values (${name}, ${body.userId}, ${role}) on conflict (project_name, user_id) do update set role = excluded.role`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { name } = await params;
  if (!(await canManageProject(session.userId, name, session.role))) return NextResponse.json({ error: "无权管理项目成员" }, { status: 403 });
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "缺少成员 ID" }, { status: 400 });
  await db`delete from project_members where project_name = ${name} and user_id = ${userId}`;
  return NextResponse.json({ ok: true });
}
