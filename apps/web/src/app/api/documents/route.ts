import { NextResponse } from "next/server";

import { createDocumentId, normalizeProject, normalizeTitle } from "@/lib/documents";
import { nextSortOrder } from "@/lib/document-tree";
import { db } from "@/lib/server-db";
import { getRequestSession } from "@/lib/auth";
import { permissionService } from "@/lib/permissions";

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const rows = await db`
    select id, title, project, parent_id, sort_order, updated_at, created_at
    from documents
    where deleted_at is null
    order by updated_at desc, created_at desc
  `;
  const visible = (await Promise.all(rows.map(async (document) =>
    (await permissionService.allows(session, document.id, "document:read")) ? document : null
  ))).filter((document): document is NonNullable<typeof document> => document !== null);
  return NextResponse.json(visible.map((document) => ({
    id: document.id,
    title: document.title,
    project: document.project,
    parentId: document.parent_id,
    sortOrder: Number(document.sort_order),
    updatedAt: document.updated_at,
    createdAt: document.created_at,
  })));
}

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { project?: unknown; parentId?: unknown; sourceDocumentId?: unknown };
  const project = normalizeProject(body.project);
  const id = createDocumentId();
  const [targetProject] = await db`select 1 from projects where name = ${project} and deleted_at is null`;
  if (!targetProject) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const targetPermissions = await permissionService.forProject(session, project);
  if (!targetPermissions["document:update"]) return NextResponse.json({ error: "无权在该项目创建文档" }, { status: 403 });

  const parentId = typeof body.parentId === "string" ? body.parentId : null;
  if (parentId) {
    const parentAccess = await permissionService.allows(session, parentId, "document:update");
    const [parent] = parentAccess ? await db`select id from documents where id = ${parentId} and project = ${project} and deleted_at is null` : [];
    if (!parent) return NextResponse.json({ error: "Parent document not found in project" }, { status: 400 });
  }

  if (typeof body.sourceDocumentId === "string") {
    const sourceAccess = await permissionService.allows(session, body.sourceDocumentId, "document:read");
    const [source] = sourceAccess ? await db`select id, title, project from documents where id = ${body.sourceDocumentId} and deleted_at is null` : [];
    if (!source) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    const [document] = await db.begin(async (tx) => {
      const sourceTree = await tx`
        with recursive tree as (
          select id, parent_id, title, block_json, markdown, plain_text, ydoc_state, content_version, sort_order, 0 as depth
          from documents where id = ${source.id}
          union all
          select child.id, child.parent_id, child.title, child.block_json, child.markdown, child.plain_text, child.ydoc_state, child.content_version, child.sort_order, tree.depth + 1
          from documents child join tree on child.parent_id = tree.id
          where child.deleted_at is null and child.project = ${source.project}
        ) select * from tree order by depth, sort_order, id
      `;
      const ids = new Map<string, string>([[source.id, id]]);
      for (const row of sourceTree.slice(1)) ids.set(row.id, createDocumentId());
      let root: { id: string; title: string; project: string; parent_id: string | null; sort_order: number; updated_at: Date; created_at: Date } | undefined;
      for (const row of sourceTree) {
        const copiedId = ids.get(row.id)!;
        const copiedParentId = row.id === source.id ? parentId : ids.get(row.parent_id)!;
        const title = row.id === source.id ? normalizeTitle(`${row.title} 副本`) : row.title;
        const [created] = await tx`
          insert into documents (id, title, project, parent_id, sort_order, block_json, markdown, plain_text, ydoc_state, content_version)
          values (${copiedId}, ${title}, ${project}, ${copiedParentId}, ${row.sort_order}, ${tx.json(row.block_json)}, ${row.markdown}, ${row.plain_text}, ${row.ydoc_state}, ${row.content_version})
          returning id, title, project, parent_id, sort_order, updated_at, created_at
        `;
        if (row.id === source.id) root = created as unknown as typeof root;
      }
      return [root!];
    });
    return NextResponse.json({
      id: document.id,
      title: document.title,
      project: document.project,
      parentId: document.parent_id,
      sortOrder: Number(document.sort_order),
      updatedAt: document.updated_at,
      createdAt: document.created_at,
    }, { status: 201 });
  }

  const title = normalizeTitle(undefined);
  const siblings = await db`select id, parent_id, sort_order from documents where project = ${project} and parent_id is not distinct from ${parentId} and deleted_at is null`;
  const sortOrder = nextSortOrder(siblings.map((row) => ({ id: row.id, parentId: row.parent_id, sortOrder: Number(row.sort_order) })));
  const [document] = await db`insert into documents (id, title, project, parent_id, sort_order) values (${id}, ${title}, ${project}, ${parentId}, ${sortOrder}) returning id, title, project, parent_id, sort_order, updated_at, created_at`;
  return NextResponse.json({
    id: document.id,
    title: document.title,
    project: document.project,
    parentId: document.parent_id,
    sortOrder: Number(document.sort_order),
    updatedAt: document.updated_at,
    createdAt: document.created_at,
  }, { status: 201 });
}
