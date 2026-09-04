import { NextResponse } from "next/server";

import { createDocumentId, normalizeProject, normalizeTitle } from "@/lib/documents";
import { db } from "@/lib/server-db";
import { getRequestSession } from "@/lib/auth";

export async function GET(request: Request) {
  if (!(await getRequestSession(request))) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const rows = await db`
    select id, title, project, updated_at, created_at
    from documents
    where deleted_at is null
    order by updated_at desc, created_at desc
  `;
  return NextResponse.json(rows.map((document) => ({
    id: document.id,
    title: document.title,
    project: document.project,
    updatedAt: document.updated_at,
    createdAt: document.created_at,
  })));
}

export async function POST(request: Request) {
  if (!(await getRequestSession(request))) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { project?: unknown; sourceDocumentId?: unknown };
  const project = normalizeProject(body.project);
  const id = createDocumentId();

  if (typeof body.sourceDocumentId === "string") {
    const [source] = await db`
      select title, block_json, markdown, plain_text
      from documents where id = ${body.sourceDocumentId}
    `;
    if (!source) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const title = normalizeTitle(`${source.title} 副本`);
    const [document] = await db`
      insert into documents (id, title, project, block_json, markdown, plain_text)
      values (${id}, ${title}, ${project}, ${db.json(source.block_json)}, ${source.markdown}, ${source.plain_text})
      returning id, title, project, updated_at, created_at
    `;
    return NextResponse.json({
      id: document.id,
      title: document.title,
      project: document.project,
      updatedAt: document.updated_at,
      createdAt: document.created_at,
    }, { status: 201 });
  }

  const title = normalizeTitle(undefined);
  const [document] = await db`
    insert into documents (id, title, project)
    values (${id}, ${title}, ${project})
    returning id, title, project, updated_at, created_at
  `;
  return NextResponse.json({
    id: document.id,
    title: document.title,
    project: document.project,
    updatedAt: document.updated_at,
    createdAt: document.created_at,
  }, { status: 201 });
}
