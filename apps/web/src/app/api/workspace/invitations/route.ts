import { NextResponse } from "next/server";
import { createInvitation, getRequestSession, listWorkspaceMembers } from "@/lib/auth";
import { deliverInvitationMail } from "@/lib/invitation-mail";

function canManageMembers(role: string) {
  return role === "owner" || role === "admin";
}

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canManageMembers(session.role)) return NextResponse.json({ error: "无权管理成员" }, { status: 403 });
  const members = await listWorkspaceMembers(session);
  return NextResponse.json(members.map((member) => ({
    id: member.id, email: member.email, displayName: member.display_name, role: member.role, joinedAt: member.created_at, lastActiveAt: member.last_active_at,
  })));
}

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canManageMembers(session.role)) return NextResponse.json({ error: "无权管理成员" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { email?: unknown; role?: unknown };
  try {
    const invitation = await createInvitation({ email: body.email, role: body.role, invitedBy: session });
    const baseUrl = process.env.SEEK_APP_URL ?? new URL(request.url).origin;
    const link = new URL(`/accept-invitation?token=${encodeURIComponent(invitation.token)}`, baseUrl).toString();
    const delivery = await deliverInvitationMail({ email: invitation.email, link, workspaceName: session.workspaceName, inviterName: session.displayName });
    return NextResponse.json({ email: invitation.email, delivered: delivery.delivered, invitationLink: delivery.delivered ? undefined : link }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建邀请失败" }, { status: 400 });
  }
}
