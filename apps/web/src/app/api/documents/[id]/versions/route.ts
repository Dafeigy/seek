import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth";
import { permissionService } from "@/lib/permissions";
import { db } from "@/lib/server-db";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  if (!(await permissionService.allows(session, id, "document:history"))) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  const versions = await db`
    select versions.version, versions.publish_note, versions.published_at,
      users.id as publisher_id, users.display_name as publisher_name
    from document_versions versions
    left join users on users.id = versions.published_by
    where versions.document_id = ${id}
    order by versions.version desc
  `;
  return NextResponse.json({
    versions: versions.map((version) => ({
      version: Number(version.version),
      note: version.publish_note,
      publishedAt: new Date(version.published_at).toISOString(),
      publisher: version.publisher_id ? { id: version.publisher_id, displayName: version.publisher_name } : null,
    })),
  });
}
