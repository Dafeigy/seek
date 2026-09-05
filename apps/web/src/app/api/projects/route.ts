import { NextResponse } from "next/server";

import { normalizeProject } from "@/lib/documents";
import { db } from "@/lib/server-db";
import { getRequestSession } from "@/lib/auth";
import { permissionService } from "@/lib/permissions";

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const rows = await db`
    select name, is_private
    from projects
    where deleted_at is null
    order by is_private asc, created_at asc, name asc
  `;
  const visible = (await Promise.all(rows.map(async (project) => {
    const permissions = await permissionService.forProject(session, project.name);
    return permissions["document:read"] ? { project, permissions } : null;
  }))).filter((item): item is NonNullable<typeof item> => item !== null);
  return NextResponse.json(visible.map(({ project, permissions }) => ({
    name: project.name,
    isPrivate: project.is_private,
    canManage: permissions["document:share"],
    canCreateDocuments: permissions["document:update"],
  })));
}

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (session.role !== "owner" && session.role !== "admin") return NextResponse.json({ error: "无权创建项目" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { name?: unknown; isPrivate?: unknown };
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Project name is required" }, { status: 400 });
  }

  const name = normalizeProject(body.name);
  const [project] = await db.begin(async (tx) => {
    const created = await tx`
      insert into projects (name, is_private)
      values (${name}, ${body.isPrivate === true})
      on conflict (name) do nothing
      returning name, is_private
    `;
    if (created[0]) await tx`
      insert into project_members (project_name, user_id, role)
      values (${name}, ${session.userId}, 'admin')
      on conflict (project_name, user_id) do update set role = excluded.role
    `;
    return created;
  });
  if (!project) return NextResponse.json({ error: "Project already exists" }, { status: 409 });

  return NextResponse.json({
    name: project.name,
    isPrivate: project.is_private,
  }, { status: 201 });
}
