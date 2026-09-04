import { NextResponse } from "next/server";

import { normalizeProject } from "@/lib/documents";
import { db } from "@/lib/server-db";
import { getRequestSession } from "@/lib/auth";

export async function GET(request: Request) {
  if (!(await getRequestSession(request))) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const rows = await db`
    select name, is_private
    from projects
    order by is_private asc, created_at asc, name asc
  `;
  return NextResponse.json(rows.map((project) => ({
    name: project.name,
    isPrivate: project.is_private,
  })));
}

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
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
