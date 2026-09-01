import { NextResponse } from "next/server";
import { db } from "@/lib/server-db";
import { normalizeProject, normalizeTitle } from "@/lib/documents";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [document] = await db`select id, title, project, block_json, markdown, plain_text, content_version, updated_at from documents where id = ${id} and deleted_at is null`;
  return document ? NextResponse.json({
    id: document.id,
    title: document.title,
    project: document.project,
    blockJson: document.block_json,
    markdown: document.markdown,
    plainText: document.plain_text,
    contentVersion: Number(document.content_version),
    updatedAt: document.updated_at,
  }) : NextResponse.json({ error: "Document not found" }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({
    error: "Whole-document saves are disabled; update the realtime Y.Doc instead",
  }, { status: 409 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { title?: unknown; project?: unknown };
  if (body.title === undefined && body.project === undefined) {
    return NextResponse.json({ error: "No document changes supplied" }, { status: 400 });
  }

  const [current] = await db`select title, project from documents where id = ${id} and deleted_at is null`;
  if (!current) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const title = body.title === undefined ? current.title : normalizeTitle(body.title);
  const project = body.project === undefined ? current.project : normalizeProject(body.project, current.project);
  const [document] = await db`
    update documents set title = ${title}, project = ${project}, updated_at = now()
    where id = ${id}
    returning id, title, project, updated_at
  `;
  return NextResponse.json({ id: document.id, title: document.title, project: document.project, updatedAt: document.updated_at });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [document] = await db`update documents set deleted_at = now(), updated_at = now() where id = ${id} and deleted_at is null returning id`;
  return document
    ? NextResponse.json({ id: document.id })
    : NextResponse.json({ error: "Document not found" }, { status: 404 });
}
