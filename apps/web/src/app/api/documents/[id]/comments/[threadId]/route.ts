import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth";
import { permissionService } from "@/lib/permissions";
import { db } from "@/lib/server-db";

type Context = { params: Promise<{ id: string; threadId: string }> };

export async function POST(request: Request, { params }: Context) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id, threadId } = await params;
  if (!(await permissionService.allows(session, id, "document:comment"))) return NextResponse.json({ error: "无权评论该文档" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { content?: unknown };
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content || content.length > 10_000) return NextResponse.json({ error: "评论内容无效" }, { status: 400 });
  const [thread] = await db`select id from comment_threads where id = ${threadId} and document_id = ${id}`;
  if (!thread) return NextResponse.json({ error: "评论线程不存在" }, { status: 404 });
  const commentId = randomUUID();
  await db.begin(async (tx) => {
    await tx`insert into comments (id, thread_id, author_id, content) values (${commentId}, ${threadId}, ${session.userId}, ${content})`;
    await tx`update comment_threads set updated_at = now() where id = ${threadId}`;
  });
  return NextResponse.json({ id: commentId }, { status: 201 });
}

export async function PATCH(request: Request, { params }: Context) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id, threadId } = await params;
  if (!(await permissionService.allows(session, id, "document:comment"))) return NextResponse.json({ error: "无权修改评论状态" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { status?: unknown };
  if (body.status !== "open" && body.status !== "resolved") return NextResponse.json({ error: "状态无效" }, { status: 400 });
  const [thread] = await db`
    update comment_threads set status = ${body.status},
      resolved_by = ${body.status === "resolved" ? session.userId : null},
      resolved_at = ${body.status === "resolved" ? new Date() : null}, updated_at = now()
    where id = ${threadId} and document_id = ${id} returning id, status
  `;
  return thread ? NextResponse.json(thread) : NextResponse.json({ error: "评论线程不存在" }, { status: 404 });
}
