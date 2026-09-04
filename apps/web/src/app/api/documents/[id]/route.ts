import { NextResponse } from "next/server";
import { db } from "@/lib/server-db";
import { normalizeProject, normalizeTitle } from "@/lib/documents";
import { isValidParent, nextSortOrder } from "@/lib/document-tree";
import { getRequestSession } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getRequestSession(request))) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const [document] = await db`select id, title, project, parent_id, sort_order, block_json, markdown, plain_text, content_version, updated_at from documents where id = ${id} and deleted_at is null`;
  return document ? NextResponse.json({
    id: document.id,
    title: document.title,
    project: document.project,
    parentId: document.parent_id,
    sortOrder: Number(document.sort_order),
    blockJson: document.block_json,
    markdown: document.markdown,
    plainText: document.plain_text,
    contentVersion: Number(document.content_version),
    updatedAt: document.updated_at,
  }) : NextResponse.json({ error: "Document not found" }, { status: 404 });
}

export async function POST(request: Request) {
  if (!(await getRequestSession(request))) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json({
    error: "Whole-document saves are disabled; update the realtime Y.Doc instead",
  }, { status: 409 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getRequestSession(request))) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { title?: unknown; project?: unknown; parentId?: unknown; sortOrder?: unknown };
  if (body.title === undefined && body.project === undefined && body.parentId === undefined && body.sortOrder === undefined) {
    return NextResponse.json({ error: "No document changes supplied" }, { status: 400 });
  }

  const [current] = await db`select title, project, parent_id, sort_order from documents where id = ${id} and deleted_at is null`;
  if (!current) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const title = body.title === undefined ? current.title : normalizeTitle(body.title);
  const project = body.project === undefined ? current.project : normalizeProject(body.project, current.project);
  if (project !== current.project) {
    return NextResponse.json({ error: "Cross-project moves are not supported; copy the document tree instead" }, { status: 400 });
  }
  const requestedParentId = body.parentId === undefined ? (project === current.project ? current.parent_id : null) : (typeof body.parentId === "string" ? body.parentId : null);
  const rows = await db`select id, parent_id, sort_order from documents where project = ${project} and deleted_at is null`;
  if (!isValidParent(rows.map((row) => ({ id: row.id, parentId: row.parent_id, sortOrder: Number(row.sort_order) })), id, requestedParentId)) {
    return NextResponse.json({ error: "A document cannot be moved below itself or a descendant" }, { status: 400 });
  }
  if (requestedParentId) {
    const [parent] = await db`select id from documents where id = ${requestedParentId} and project = ${project} and deleted_at is null`;
    if (!parent) return NextResponse.json({ error: "Parent document not found in project" }, { status: 400 });
  }
  const sortOrder = typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
    ? body.sortOrder
    : (requestedParentId === current.parent_id && project === current.project ? Number(current.sort_order) : nextSortOrder(rows.filter((row) => row.parent_id === requestedParentId && row.id !== id).map((row) => ({ id: row.id, parentId: row.parent_id, sortOrder: Number(row.sort_order) }))));
  const [document] = await db`
    update documents set title = ${title}, project = ${project}, parent_id = ${requestedParentId}, sort_order = ${sortOrder}, updated_at = now()
    where id = ${id}
    returning id, title, project, parent_id, sort_order, updated_at
  `;
  return NextResponse.json({ id: document.id, title: document.title, project: document.project, parentId: document.parent_id, sortOrder: Number(document.sort_order), updatedAt: document.updated_at });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getRequestSession(request))) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const [document] = await db.begin(async (tx) => {
    await tx`update documents set parent_id = null, updated_at = now() where parent_id = ${id} and deleted_at is null`;
    return tx`update documents set deleted_at = now(), updated_at = now() where id = ${id} and deleted_at is null returning id`;
  });
  return document
    ? NextResponse.json({ id: document.id })
    : NextResponse.json({ error: "Document not found" }, { status: 404 });
}
