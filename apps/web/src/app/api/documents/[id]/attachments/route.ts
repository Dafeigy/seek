import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth";
import { MAX_ATTACHMENT_BYTES, putAttachment, removeAttachment, safeFileName, validateMimeType } from "@/lib/attachment-storage";
import { permissionService } from "@/lib/permissions";
import { db } from "@/lib/server-db";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  if (!(await permissionService.allows(session, id, "document:read"))) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const includeDeleted = new URL(request.url).searchParams.get("includeDeleted") === "1"
    && Boolean(await permissionService.allows(session, id, "document:restore"));
  const rows = await db`
    select attachments.id, attachments.file_name, attachments.mime_type, attachments.byte_size, attachments.created_at, attachments.deleted_at,
      users.display_name as uploader_name
    from attachments join users on users.id = attachments.uploaded_by
    where attachments.document_id = ${id}
      and (
        attachments.deleted_at is null
        or (${includeDeleted} and attachments.deleted_at >= now() - interval '30 days')
      )
    order by attachments.created_at desc
  `;
  return NextResponse.json({ attachments: rows.map((row) => ({
    id: row.id, fileName: row.file_name, mimeType: row.mime_type, byteSize: Number(row.byte_size),
    createdAt: new Date(row.created_at).toISOString(), deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null, uploaderName: row.uploader_name,
    url: `/api/documents/${encodeURIComponent(id)}/attachments/${encodeURIComponent(row.id)}`,
  })) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  if (!(await permissionService.allows(session, id, "document:update"))) return NextResponse.json({ error: "无权上传附件" }, { status: 403 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_ATTACHMENT_BYTES + 1024 * 1024) return NextResponse.json({ error: "附件请求过大" }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "缺少附件" }, { status: 400 });
  if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: "附件大小必须在 1B 到 20MB 之间" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  let mimeType: string;
  try {
    mimeType = validateMimeType(bytes, file.type, file.name);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "附件类型无效" }, { status: 415 });
  }
  const attachmentId = randomUUID();
  const storageKey = `${id}/${attachmentId}`;
  let sha256: string;
  try {
    sha256 = await putAttachment(storageKey, bytes);
  } catch {
    return NextResponse.json({ error: "附件写入失败" }, { status: 500 });
  }
  const fileName = safeFileName(file.name);
  try {
    await db`
      insert into attachments (id, document_id, storage_key, file_name, mime_type, byte_size, sha256, uploaded_by)
      values (${attachmentId}, ${id}, ${storageKey}, ${fileName}, ${mimeType}, ${bytes.byteLength}, ${sha256}, ${session.userId})
    `;
  } catch (error) {
    await removeAttachment(storageKey);
    throw error;
  }
  return NextResponse.json({ id: attachmentId, fileName, mimeType, byteSize: bytes.byteLength, url: `/api/documents/${encodeURIComponent(id)}/attachments/${attachmentId}` }, { status: 201 });
}
