import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth";
import { normalizeProject } from "@/lib/documents";
import { permissionService } from "@/lib/permissions";
import { db } from "@/lib/server-db";

async function manager(request: Request, name: string) {
  const session = await getRequestSession(request);
  if (!session) return { response: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  if (!(await permissionService.forProject(session, name))["document:share"]) return { response: NextResponse.json({ error: "无权管理项目" }, { status: 403 }) };
  return { session };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const access = await manager(request, name);
  if (access.response) return access.response;
  const body = await request.json().catch(() => ({})) as { name?: unknown; isPrivate?: unknown };
  const nextName = body.name === undefined ? name : normalizeProject(body.name, name);
  try {
    const [project] = await db.begin(async (tx) => {
      const updated = await tx`
        update projects set name = ${nextName}, is_private = coalesce(${typeof body.isPrivate === "boolean" ? body.isPrivate : null}, is_private), updated_at = now()
        where name = ${name} and deleted_at is null returning name, is_private
      `;
      if (updated[0] && nextName !== name) {
        await tx`update documents set project = ${nextName}, updated_at = now() where project = ${name}`;
        await tx`update workspace_invitations set project_name = ${nextName} where project_name = ${name} and accepted_at is null`;
      }
      return updated;
    });
    return project ? NextResponse.json({ name: project.name, isPrivate: project.is_private }) : NextResponse.json({ error: "Project not found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && "code" in error && error.code === "23505" ? "同名项目已经存在" : "项目属性保存失败" }, { status: 409 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const access = await manager(request, name);
  if (access.response) return access.response;
  const [project] = await db.begin(async (tx) => {
    const updated = await tx`update projects set deleted_at = now(), updated_at = now() where name = ${name} and deleted_at is null returning name`;
    if (updated[0]) await tx`update documents set deleted_at = coalesce(deleted_at, now()), updated_at = now() where project = ${name}`;
    return updated;
  });
  return project ? NextResponse.json({ name: project.name }) : NextResponse.json({ error: "Project not found" }, { status: 404 });
}
