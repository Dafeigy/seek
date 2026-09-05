import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth";
import type { AuthSession } from "@/lib/auth";
import { db } from "@/lib/server-db";
import { permissionService } from "@/lib/permissions";
import { createInvitation } from "@/lib/auth";
import { deliverInvitationMail } from "@/lib/invitation-mail";

const projectRoles = ["admin", "editor", "commenter", "viewer"] as const;

async function canManageProject(session: AuthSession, projectName: string) {
  const [project] = await db`select 1 from projects where name = ${projectName} and deleted_at is null`;
  return Boolean(project) && (await permissionService.forProject(session, projectName))["document:share"];
}

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { name } = await params;
  if (!(await canManageProject(session, name))) return NextResponse.json({ error: "无权管理项目成员" }, { status: 403 });
  const members = await db`
    select u.id, u.email, u.display_name, pm.role, pm.created_at
    from project_members pm join users u on u.id = pm.user_id
    where pm.project_name = ${name}
    order by case pm.role when 'admin' then 0 when 'editor' then 1 when 'commenter' then 2 else 3 end, u.email
  `;
  const pending = await db`
    select id, email, project_role, expires_at from workspace_invitations
    where project_name = ${name} and accepted_at is null and expires_at > now()
    order by created_at desc
  `;
  return NextResponse.json({
    members: members.map((member) => ({ id: member.id, email: member.email, displayName: member.display_name, role: member.role, addedAt: member.created_at })),
    pending: pending.map((invite) => ({ id: invite.id, email: invite.email, role: invite.project_role, expiresAt: invite.expires_at })),
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { name } = await params;
  if (!(await canManageProject(session, name))) return NextResponse.json({ error: "无权管理项目成员" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { userId?: unknown; email?: unknown; role?: unknown };
  if ((typeof body.userId !== "string" && typeof body.email !== "string") || !projectRoles.includes(body.role as typeof projectRoles[number])) return NextResponse.json({ error: "成员或角色无效" }, { status: 400 });
  const role = body.role as typeof projectRoles[number];
  const [workspaceMember] = typeof body.userId === "string"
    ? await db`select u.id, u.email from workspace_members wm join users u on u.id = wm.user_id where wm.workspace_id = ${session.workspaceId} and u.id = ${body.userId}`
    : await db`select u.id, u.email from workspace_members wm join users u on u.id = wm.user_id where wm.workspace_id = ${session.workspaceId} and lower(u.email) = lower(${String(body.email)})`;
  if (workspaceMember) {
    await db`insert into project_members (project_name, user_id, role) values (${name}, ${workspaceMember.id}, ${role}) on conflict (project_name, user_id) do update set role = excluded.role`;
    return NextResponse.json({ ok: true, joined: true });
  }
  if (typeof body.email !== "string") return NextResponse.json({ error: "该用户不属于当前 Workspace" }, { status: 400 });
  try {
    const invitation = await createInvitation({ email: body.email, role: "member", invitedBy: session, projectName: name, projectRole: role });
    const baseUrl = process.env.SEEK_APP_URL ?? new URL(request.url).origin;
    const link = new URL(`/accept-invitation?token=${encodeURIComponent(invitation.token)}`, baseUrl).toString();
    const delivery = await deliverInvitationMail({ email: invitation.email, link, workspaceName: session.workspaceName, inviterName: session.displayName });
    return NextResponse.json({ ok: true, joined: false, delivered: delivery.delivered, invitationLink: delivery.delivered ? undefined : link });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建项目邀请失败" }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { name } = await params;
  if (!(await canManageProject(session, name))) return NextResponse.json({ error: "无权管理项目成员" }, { status: 403 });
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "缺少成员 ID" }, { status: 400 });
  await db`delete from project_members where project_name = ${name} and user_id = ${userId}`;
  return NextResponse.json({ ok: true });
}
