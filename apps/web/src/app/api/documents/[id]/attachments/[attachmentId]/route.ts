import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth";
import { getAttachment } from "@/lib/attachment-storage";
import { permissionService } from "@/lib/permissions";
import { db } from "@/lib/server-db";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id, attachmentId } = await params;
  if (!(await permissionService.allows(session, id, "document:read"))) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  const [attachment] = await db`
    select storage_key, file_name, mime_type from attachments
    where id = ${attachmentId} and document_id = ${id} and deleted_at is null
  `;
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  try {
    const bytes = await getAttachment(attachment.storage_key);
    const inline = ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(String(attachment.mime_type));
    return new Response(bytes, {
      headers: {
        "content-type": attachment.mime_type,
        "content-length": String(bytes.byteLength),
        "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.file_name)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Attachment data unavailable" }, { status: 404 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id, attachmentId } = await params;
  if (!(await permissionService.allows(session, id, "document:update"))) return NextResponse.json({ error: "无权删除附件" }, { status: 403 });
  const [attachment] = await db`
    update attachments set deleted_at = now(), updated_at = now()
    where id = ${attachmentId} and document_id = ${id} and deleted_at is null returning id
  `;
  return attachment ? NextResponse.json({ id: attachment.id }) : NextResponse.json({ error: "Attachment not found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id, attachmentId } = await params;
  if (!(await permissionService.allows(session, id, "document:restore"))) return NextResponse.json({ error: "无权恢复附件" }, { status: 403 });
  const [attachment] = await db`
    update attachments set deleted_at = null, updated_at = now()
    where id = ${attachmentId} and document_id = ${id}
      and deleted_at is not null and deleted_at >= now() - interval '30 days' returning id
  `;
  return attachment ? NextResponse.json({ id: attachment.id }) : NextResponse.json({ error: "Attachment not found or recovery period expired" }, { status: 404 });
}
