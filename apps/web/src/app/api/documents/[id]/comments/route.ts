import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth";
import { permissionService } from "@/lib/permissions";
import { db } from "@/lib/server-db";

const validBlockId = /^[A-Za-z0-9_-]{1,160}$/;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  if (!(await permissionService.allows(session, id, "document:read"))) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const rows = await db`
    select threads.id, threads.anchor_block_id, threads.anchor_from, threads.anchor_to,
      threads.selected_text, threads.anchor_from_relative, threads.anchor_to_relative,
      threads.status, threads.created_at, threads.updated_at,
      comments.id as comment_id, comments.content, comments.created_at as comment_created_at,
      users.id as author_id, users.display_name as author_name
    from comment_threads threads
    join comments on comments.thread_id = threads.id
    join users on users.id = comments.author_id
    where threads.document_id = ${id}
    order by threads.created_at desc, comments.created_at asc
  `;
  const threads = new Map<string, Record<string, unknown> & { comments: unknown[] }>();
  for (const row of rows) {
    let thread = threads.get(row.id);
    if (!thread) {
      thread = {
        id: row.id,
        anchor: { blockId: row.anchor_block_id, from: row.anchor_from, to: row.anchor_to, selectedText: row.selected_text, relativeFrom: row.anchor_from_relative, relativeTo: row.anchor_to_relative },
        status: row.status,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        comments: [],
      };
      threads.set(row.id, thread);
    }
    thread.comments.push({
      id: row.comment_id,
      content: row.content,
      createdAt: new Date(row.comment_created_at).toISOString(),
      author: { id: row.author_id, displayName: row.author_name },
    });
  }
  return NextResponse.json({ threads: [...threads.values()] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  if (!(await permissionService.allows(session, id, "document:comment"))) return NextResponse.json({ error: "无权评论该文档" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { content?: unknown; blockId?: unknown; from?: unknown; to?: unknown; selectedText?: unknown; relativeFrom?: unknown; relativeTo?: unknown; contextBefore?: unknown; contextAfter?: unknown };
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const blockId = typeof body.blockId === "string" ? body.blockId : "";
  if (!content || content.length > 10_000 || !validBlockId.test(blockId)) return NextResponse.json({ error: "评论内容或锚点无效" }, { status: 400 });
  const selectedText = typeof body.selectedText === "string" ? body.selectedText.slice(0, 2_000) : "";
  const from = Number.isSafeInteger(body.from) && Number(body.from) >= 0 ? Number(body.from) : null;
  const to = Number.isSafeInteger(body.to) && Number(body.to) >= 0 ? Number(body.to) : null;
  if (from !== null && to !== null && from > to) return NextResponse.json({ error: "评论选区无效" }, { status: 400 });
  const relativeFrom = typeof body.relativeFrom === "string" && /^[A-Za-z0-9+/=]{1,4096}$/.test(body.relativeFrom) ? body.relativeFrom : null;
  const relativeTo = typeof body.relativeTo === "string" && /^[A-Za-z0-9+/=]{1,4096}$/.test(body.relativeTo) ? body.relativeTo : null;
  const contextBefore = typeof body.contextBefore === "string" ? body.contextBefore.slice(-64) : "";
  const contextAfter = typeof body.contextAfter === "string" ? body.contextAfter.slice(0, 64) : "";
  const threadId = randomUUID();
  const commentId = randomUUID();
  await db.begin(async (tx) => {
    await tx`
      insert into comment_threads (id, document_id, anchor_block_id, anchor_from, anchor_to, anchor_from_relative, anchor_to_relative, selected_text, context_hash, created_by)
      values (${threadId}, ${id}, ${blockId}, ${from}, ${to}, ${relativeFrom}, ${relativeTo}, ${selectedText}, ${createHash("sha256").update(`${contextBefore}\0${selectedText}\0${contextAfter}`).digest("hex")}, ${session.userId})
    `;
    await tx`insert into comments (id, thread_id, author_id, content) values (${commentId}, ${threadId}, ${session.userId}, ${content})`;
  });
  return NextResponse.json({ id: threadId }, { status: 201 });
}
