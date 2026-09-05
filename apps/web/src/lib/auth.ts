import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { db } from "@/lib/server-db";

const COOKIE_NAME = "seek_session";
const SESSION_DAYS = 7;
const SCRYPT_COST = 16_384;

export type WorkspaceRole = "owner" | "admin" | "member" | "guest";
export type AuthSession = {
  userId: string;
  email: string;
  displayName: string;
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
};

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

export function validatePassword(value: unknown) {
  if (typeof value !== "string" || value.length < 12 || value.length > 256) {
    return "密码长度须为 12 至 256 个字符";
  }
  return null;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function scryptKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, { N: SCRYPT_COST, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => {
      if (error) reject(error);
      else resolve(Buffer.from(derived));
    });
  });
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scryptKey(password, salt);
  return `scrypt$${SCRYPT_COST}$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [algorithm, cost, blockSize, parallelization, salt, expected] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  try {
    if (Number(cost) !== SCRYPT_COST || Number(blockSize) !== 8 || Number(parallelization) !== 1) return false;
    const derived = await scryptKey(password, Buffer.from(salt, "base64url"));
    const expectedBuffer = Buffer.from(expected, "base64url");
    return expectedBuffer.length === derived.length && timingSafeEqual(expectedBuffer, derived);
  } catch {
    return false;
  }
}

function tokenFromCookie(cookieHeader: string | null) {
  return cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) ?? null;
}

async function lookupSession(token: string | null): Promise<AuthSession | null> {
  if (!token || token.length < 32) return null;
  const [session] = await db`
    select u.id as user_id, u.email, u.display_name, w.id as workspace_id, w.name as workspace_name, wm.role
    from auth_sessions s
    join users u on u.id = s.user_id
    join workspace_members wm on wm.user_id = u.id
    join workspaces w on w.id = wm.workspace_id
    where s.token_digest = ${digest(token)} and s.expires_at > now()
    order by wm.created_at asc
    limit 1
  `;
  if (!session) return null;
  await db`update auth_sessions set last_seen_at = now() where token_digest = ${digest(token)}`;
  return {
    userId: session.user_id,
    email: session.email,
    displayName: session.display_name,
    workspaceId: session.workspace_id,
    workspaceName: session.workspace_name,
    role: session.role as WorkspaceRole,
  };
}

export async function getCurrentSession() {
  const store = await cookies();
  return lookupSession(store.get(COOKIE_NAME)?.value ?? null);
}

export async function getRequestSession(request: Request) {
  return lookupSession(tokenFromCookie(request.headers.get("cookie")));
}

export async function revokeRequestSession(request: Request) {
  const token = tokenFromCookie(request.headers.get("cookie"));
  if (token) await db`delete from auth_sessions where token_digest = ${digest(token)}`;
}

export function sessionCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export function expiredSessionCookie() {
  return { ...sessionCookie(""), maxAge: 0 };
}

async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db`
    insert into auth_sessions (id, user_id, token_digest, expires_at)
    values (${randomUUID()}, ${userId}, ${digest(token)}, now() + interval '7 days')
  `;
  return token;
}

export async function signIn(emailValue: unknown, password: unknown) {
  const email = normalizeEmail(emailValue);
  if (!email || typeof password !== "string") return null;
  const [user] = await db`select id, password_hash from users where email = ${email}`;
  if (!user || !(await verifyPassword(password, user.password_hash))) return null;
  return createSession(user.id);
}

export async function createInitialOwner(input: { email: unknown; password: unknown; displayName: unknown; workspaceName: unknown }) {
  const email = normalizeEmail(input.email);
  const passwordError = validatePassword(input.password);
  if (!email || passwordError || typeof input.password !== "string") throw new Error(passwordError ?? "请输入有效的邮箱地址");
  const displayName = typeof input.displayName === "string" && input.displayName.trim() ? input.displayName.trim().slice(0, 80) : email.split("@")[0];
  const workspaceName = typeof input.workspaceName === "string" && input.workspaceName.trim() ? input.workspaceName.trim().slice(0, 100) : "我的 Workspace";
  const passwordHash = await hashPassword(input.password);
  const userId = randomUUID();
  const workspaceId = randomUUID();
  await db.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('seek-initial-owner'))`;
    const [{ count }] = await tx`select count(*)::int as count from users`;
    if (count !== 0) throw new Error("初始化已完成，请使用邀请链接加入 Workspace");
    await tx`insert into workspaces (id, name) values (${workspaceId}, ${workspaceName})`;
    await tx`insert into users (id, email, display_name, password_hash) values (${userId}, ${email}, ${displayName}, ${passwordHash})`;
    await tx`insert into workspace_members (workspace_id, user_id, role) values (${workspaceId}, ${userId}, 'owner')`;
  });
  return createSession(userId);
}

export async function hasInitialOwner() {
  const [row] = await db`select exists(select 1 from users) as exists`;
  return row?.exists === true;
}

export async function createInvitation(input: { email: unknown; role: unknown; invitedBy: AuthSession; projectName?: string; projectRole?: string }) {
  const email = normalizeEmail(input.email);
  const role = input.role;
  if (!email || !["admin", "member", "guest"].includes(String(role))) throw new Error("请输入有效邮箱并选择成员角色");
  const token = randomBytes(32).toString("base64url");
  const invitationId = randomUUID();
  await db`
    insert into workspace_invitations (id, workspace_id, email, role, token_digest, invited_by_user_id, expires_at, project_name, project_role)
    values (${invitationId}, ${input.invitedBy.workspaceId}, ${email}, ${String(role)}, ${digest(token)}, ${input.invitedBy.userId}, now() + interval '7 days', ${input.projectName ?? null}, ${input.projectRole ?? null})
  `;
  return { email, token, expiresInDays: 7 };
}

export async function acceptInvitation(input: { token: unknown; password: unknown; displayName: unknown }) {
  if (typeof input.token !== "string" || typeof input.password !== "string") throw new Error("邀请链接无效");
  const invitationToken = input.token;
  const passwordError = validatePassword(input.password);
  if (passwordError) throw new Error(passwordError);
  const displayName = typeof input.displayName === "string" && input.displayName.trim() ? input.displayName.trim().slice(0, 80) : "新成员";
  const passwordHash = await hashPassword(input.password);
  let userId = "";
  await db.begin(async (tx) => {
    const [invite] = await tx`
      select id, workspace_id, email, role, project_name, project_role from workspace_invitations
      where token_digest = ${digest(invitationToken)} and accepted_at is null and expires_at > now()
      for update
    `;
    if (!invite) throw new Error("邀请链接无效、已使用或已过期");
    const email = normalizeEmail(invite.email);
    if (!email) throw new Error("邀请邮箱无效");
    const [existingUser] = await tx`select id from users where email = ${email}`;
    userId = existingUser?.id ?? randomUUID();
    if (!existingUser) {
      await tx`insert into users (id, email, display_name, password_hash) values (${userId}, ${email}, ${displayName}, ${passwordHash})`;
    }
    await tx`
      insert into workspace_members (workspace_id, user_id, role) values (${invite.workspace_id}, ${userId}, ${invite.role})
      on conflict (workspace_id, user_id) do update set role = excluded.role
    `;
    if (invite.project_name && ["admin", "editor", "commenter", "viewer"].includes(invite.project_role)) {
      await tx`
        insert into project_members (project_name, user_id, role)
        values (${invite.project_name}, ${userId}, ${invite.project_role})
        on conflict (project_name, user_id) do update set role = excluded.role
      `;
    }
    await tx`update workspace_invitations set accepted_at = now() where id = ${invite.id}`;
  });
  return createSession(userId);
}

export async function listWorkspaceMembers(session: AuthSession) {
  return db`
    select u.id, u.email, u.display_name, wm.role, wm.created_at,
      coalesce((select max(s.last_seen_at) from auth_sessions s where s.user_id = u.id), u.created_at) as last_active_at
    from workspace_members wm join users u on u.id = wm.user_id
    where wm.workspace_id = ${session.workspaceId}
    order by case wm.role when 'owner' then 0 when 'admin' then 1 else 2 end, u.email
  `;
}

function canManageTarget(actor: AuthSession, targetId: string, targetRole: WorkspaceRole, nextRole?: WorkspaceRole) {
  if (actor.userId === targetId) return false;
  if (actor.role === "owner") return targetRole !== "owner" || nextRole === "owner";
  return actor.role === "admin" && (targetRole === "member" || targetRole === "guest") && nextRole !== "owner" && nextRole !== "admin";
}

async function workspaceMember(session: AuthSession, userId: string) {
  const [member] = await db`
    select u.id, wm.role from workspace_members wm join users u on u.id = wm.user_id
    where wm.workspace_id = ${session.workspaceId} and u.id = ${userId}
  `;
  return member as { id: string; role: WorkspaceRole } | undefined;
}

export async function updateWorkspaceMemberRole(session: AuthSession, userId: unknown, role: unknown) {
  if ((session.role !== "owner" && session.role !== "admin") || typeof userId !== "string" || !["admin", "member", "guest"].includes(String(role))) throw new Error("无权修改成员角色");
  const member = await workspaceMember(session, userId);
  const nextRole = role as WorkspaceRole;
  if (!member || !canManageTarget(session, member.id, member.role, nextRole)) throw new Error("无权修改该成员");
  await db`update workspace_members set role = ${nextRole} where workspace_id = ${session.workspaceId} and user_id = ${member.id}`;
}

export async function resetWorkspaceMemberPassword(session: AuthSession, userId: unknown, password: unknown) {
  if ((session.role !== "owner" && session.role !== "admin") || typeof userId !== "string") throw new Error("无权重置密码");
  const member = await workspaceMember(session, userId);
  if (!member || !canManageTarget(session, member.id, member.role)) throw new Error("无权重置该成员的密码");
  const passwordError = validatePassword(password);
  if (passwordError || typeof password !== "string") throw new Error(passwordError ?? "请输入有效密码");
  await db.begin(async (tx) => {
    await tx`update users set password_hash = ${await hashPassword(password)}, updated_at = now() where id = ${member.id}`;
    await tx`delete from auth_sessions where user_id = ${member.id}`;
  });
}

export async function removeWorkspaceMember(session: AuthSession, userId: unknown) {
  if ((session.role !== "owner" && session.role !== "admin") || typeof userId !== "string") throw new Error("无权删除成员");
  const member = await workspaceMember(session, userId);
  if (!member || !canManageTarget(session, member.id, member.role)) throw new Error("无权删除该成员");
  await db.begin(async (tx) => {
    await tx`delete from workspace_members where workspace_id = ${session.workspaceId} and user_id = ${member.id}`;
    await tx`delete from auth_sessions where user_id = ${member.id}`;
  });
}
