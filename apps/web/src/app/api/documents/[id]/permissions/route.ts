import { DOCUMENT_ACTIONS, type DocumentAction } from "@seek/permissions";
import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth";
import { permissionService } from "@/lib/permissions";
import { db } from "@/lib/server-db";

async function sharedContext(request: Request, id: string) {
  const session = await getRequestSession(request);
  if (!session) return { response: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  const access = await permissionService.allows(session, id, "document:share");
  if (!access) return { response: NextResponse.json({ error: "无权管理文档权限" }, { status: 403 }) };
  return { session, access };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await sharedContext(request, id);
  if (context.response) return context.response;
  const rows = await db`
    select acl.user_id, users.email, users.display_name, acl.action, acl.effect, acl.updated_at
    from document_acl acl join users on users.id = acl.user_id
    where acl.document_id = ${id}
    order by users.email, acl.action
  `;
  return NextResponse.json(rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    action: row.action,
    effect: row.effect,
    updatedAt: row.updated_at,
  })));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await sharedContext(request, id);
  if (context.response || !context.session || !context.access) return context.response!;
  const body = await request.json().catch(() => ({})) as { userId?: unknown; action?: unknown; effect?: unknown };
  if (typeof body.userId !== "string" || !DOCUMENT_ACTIONS.includes(body.action as DocumentAction) || (body.effect !== "allow" && body.effect !== "deny")) {
    return NextResponse.json({ error: "成员、操作或 ACL 效果无效" }, { status: 400 });
  }
  const [member] = await db`
    select 1
    from workspace_members wm
    join project_members pm on pm.user_id = wm.user_id and pm.project_name = ${context.access.document.project}
    where wm.workspace_id = ${context.session.workspaceId} and wm.user_id = ${body.userId}
  `;
  if (!member) return NextResponse.json({ error: "ACL 只能授予该项目内的 Workspace 成员" }, { status: 400 });
  await db`
    insert into document_acl (document_id, user_id, action, effect)
    values (${id}, ${body.userId}, ${String(body.action)}, ${body.effect})
    on conflict (document_id, user_id, action) do update set effect = excluded.effect, updated_at = now()
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await sharedContext(request, id);
  if (context.response) return context.response;
  const query = new URL(request.url).searchParams;
  const userId = query.get("userId");
  const action = query.get("action");
  if (!userId || !DOCUMENT_ACTIONS.includes(action as DocumentAction)) return NextResponse.json({ error: "缺少成员或操作" }, { status: 400 });
  await db`delete from document_acl where document_id = ${id} and user_id = ${userId} and action = ${action!}`;
  return NextResponse.json({ ok: true });
}
