import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth";
import { db } from "@/lib/server-db";
import { permissionService } from "@/lib/permissions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  if (!(await permissionService.allows(session, id, "document:restore", true))) return NextResponse.json({ error: "无权恢复该文档" }, { status: 403 });
  const [document] = await db`
    update documents
    set deleted_at = null, updated_at = now()
    where id = ${id} and deleted_at is not null and deleted_at >= now() - interval '30 days'
    returning id, title, project, parent_id, sort_order, updated_at, created_at
  `;
  return document
    ? NextResponse.json({ id: document.id, title: document.title, project: document.project, parentId: document.parent_id, sortOrder: Number(document.sort_order), updatedAt: document.updated_at, createdAt: document.created_at })
    : NextResponse.json({ error: "Document not found or its recovery period has expired" }, { status: 404 });
}
