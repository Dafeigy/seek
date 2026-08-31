import { NextResponse } from "next/server";
import { db } from "@/lib/server-db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [document] = await db`select id, title, project, block_json, markdown, plain_text, content_version, updated_at from documents where id = ${id}`;
  return document ? NextResponse.json(document) : NextResponse.json({ error: "Document not found" }, { status: 404 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json() as { blocks: unknown[]; markdown: string; plainText: string; reason?: string };
  const [document] = await db`select content_version from documents where id = ${id}`;
  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const nextVersion = Number(document.content_version) + 1;
  await db.begin(async (tx) => {
    await tx`update documents set block_json = ${tx.json(body.blocks as never)}, markdown = ${body.markdown}, plain_text = ${body.plainText}, content_version = ${nextVersion}, updated_at = now() where id = ${id}`;
    await tx`insert into document_versions (document_id, version, block_json, markdown, reason) values (${id}, ${nextVersion}, ${tx.json(body.blocks as never)}, ${body.markdown}, ${body.reason ?? "manual"})`;
  });
  return NextResponse.json({ version: nextVersion });
}
