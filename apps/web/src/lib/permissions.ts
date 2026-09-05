import {
  issueCollaborationToken,
  resolveDocumentPermissions,
  resolveProjectPermissions,
  type DocumentAction,
  type PermissionMap,
  type ProjectRole,
} from "@seek/permissions";

import type { AuthSession } from "@/lib/auth";
import { db } from "@/lib/server-db";

export type DocumentAccess = {
  document: {
    id: string;
    title: string;
    project: string;
    parentId: string | null;
    deletedAt: Date | null;
  };
  projectRole: ProjectRole | null;
  permissions: PermissionMap;
};

export class PermissionService {
  async forProject(session: Pick<AuthSession, "userId" | "role">, projectName: string) {
    const [member] = await db`
      select role from project_members
      where project_name = ${projectName} and user_id = ${session.userId}
    `;
    return resolveProjectPermissions(session.role, (member?.role as ProjectRole | undefined) ?? null);
  }

  async forDocument(session: AuthSession, documentId: string, includeDeleted = false): Promise<DocumentAccess | null> {
    const [document] = await db`
      select id, title, project, parent_id, deleted_at
      from documents
      where id = ${documentId} and (${includeDeleted} or deleted_at is null)
    `;
    if (!document) return null;
    const [member, aclRules] = await Promise.all([
      db`select role from project_members where project_name = ${document.project} and user_id = ${session.userId}`,
      db`
        with recursive ancestors as (
          select id, parent_id, 0 as depth from documents where id = ${documentId}
          union all
          select parent.id, parent.parent_id, ancestors.depth + 1
          from documents parent join ancestors on ancestors.parent_id = parent.id
        )
        select acl.action, acl.effect, ancestors.depth
        from ancestors join document_acl acl on acl.document_id = ancestors.id
        where acl.user_id = ${session.userId}
        order by ancestors.depth asc
      `,
    ]);
    return {
      document: {
        id: document.id,
        title: document.title,
        project: document.project,
        parentId: document.parent_id,
        deletedAt: document.deleted_at,
      },
      projectRole: (member[0]?.role as ProjectRole | undefined) ?? null,
      permissions: resolveDocumentPermissions({
        workspaceRole: session.role,
        projectRole: (member[0]?.role as ProjectRole | undefined) ?? null,
        aclRules: aclRules.map((rule) => ({ action: rule.action, effect: rule.effect, depth: Number(rule.depth) })),
      }),
    };
  }

  async allows(session: AuthSession, documentId: string, action: DocumentAction, includeDeleted = false) {
    const access = await this.forDocument(session, documentId, includeDeleted);
    return access?.permissions[action] ? access : null;
  }

  issueCollaborationToken(session: AuthSession, access: DocumentAccess) {
    const secret = collaborationTokenSecret();
    return issueCollaborationToken({
      documentId: access.document.id,
      workspaceId: session.workspaceId,
      userId: session.userId,
      displayName: session.displayName,
      canUpdate: access.permissions["document:update"],
    }, secret);
  }
}

export function collaborationTokenSecret() {
  const configured = process.env.COLLABORATION_TOKEN_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("COLLABORATION_TOKEN_SECRET is required in production");
  return "seek-development-collaboration-secret-change-me";
}

export const permissionService = new PermissionService();
