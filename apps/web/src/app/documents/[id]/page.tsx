import { DocumentWorkspace } from "@/components/document-workspace";
import { EditorLoader as SeekEditor } from "@/components/editor/editor-loader";
import { db } from "@/lib/server-db";
import type { DocumentBootstrap } from "@/lib/documents";
import { notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { permissionService } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const access = await permissionService.allows(session, id, "document:read");
  if (!access) notFound();
  const [row] = await db`
    select id, title, project, block_json, markdown, plain_text, content_version, updated_at
    from documents
    where id = ${id} and deleted_at is null
  `;
  if (!row) notFound();

  const bootstrap: DocumentBootstrap = {
    id: row.id,
    title: row.title,
    project: row.project,
    blockJson: Array.isArray(row.block_json) ? row.block_json : [],
    markdown: row.markdown,
    plainText: row.plain_text,
    contentVersion: Number(row.content_version),
    updatedAt: new Date(row.updated_at).toISOString(),
    collaborationCacheScope: `${session.workspaceId}:${session.userId}`,
    canUpdate: access.permissions["document:update"],
  };

  return <DocumentWorkspace documentId={id} title={bootstrap.title} project={bootstrap.project} canUpdate={bootstrap.canUpdate}>
    <SeekEditor bootstrap={bootstrap} />
  </DocumentWorkspace>;
}
