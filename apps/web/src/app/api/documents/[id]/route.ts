import { NextResponse } from "next/server";
import { db } from "@/lib/server-db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [document] = await db`select id, title, project, block_json, markdown, plain_text, content_version, updated_at from documents where id = ${id}`;
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json() as {
    blocks: unknown[];
    markdown: string;
    plainText: string;
    title?: string;
    version?: number;
    reason?: string;
  };
  if (!Array.isArray(body.blocks) || typeof body.markdown !== "string" || typeof body.plainText !== "string") {
    return NextResponse.json({ error: "Invalid document payload" }, { status: 400 });
  }

  let nextVersion = 0;
  let updatedAt = new Date();
  let changed = false;
  await db.begin(async (tx) => {
    await tx`
      insert into documents (id, title, project)
      values (${id}, ${body.title?.trim() || id}, ${"未分类"})
      on conflict (id) do nothing
    `;
    const [document] = await tx`
      select content_version, updated_at,
        block_json = ${tx.json(body.blocks as never)} as blocks_equal,
        markdown = ${body.markdown} as markdown_equal,
        plain_text = ${body.plainText} as plain_text_equal
      from documents where id = ${id} for update
    `;
    if (document.blocks_equal && document.markdown_equal && document.plain_text_equal) {
      nextVersion = Number(document.content_version);
      updatedAt = document.updated_at as Date;
      return;
    }

    changed = true;
    nextVersion = Math.max(Number(document.content_version) + 1, Number(body.version) || 0);
    await tx`update documents set block_json = ${tx.json(body.blocks as never)}, markdown = ${body.markdown}, plain_text = ${body.plainText}, content_version = ${nextVersion}, updated_at = now() where id = ${id}`;
    await tx`insert into document_versions (document_id, version, block_json, markdown, reason) values (${id}, ${nextVersion}, ${tx.json(body.blocks as never)}, ${body.markdown}, ${body.reason ?? "manual"})`;
    await tx`
      delete from document_versions
      where document_id = ${id}
        and id not in (
          select id from document_versions
          where document_id = ${id}
          order by version desc, id desc
          limit 20
        )
    `;
    const [saved] = await tx`select updated_at from documents where id = ${id}`;
    updatedAt = saved.updated_at as Date;
  });
  return NextResponse.json({ version: nextVersion, updatedAt, changed });
}
