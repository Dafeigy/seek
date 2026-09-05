import { createHmac, timingSafeEqual } from "node:crypto";

export const DOCUMENT_ACTIONS = [
  "document:read",
  "document:comment",
  "document:update",
  "document:publish",
  "document:share",
  "document:move",
  "document:delete",
  "document:restore",
  "document:history",
] as const;

export type DocumentAction = typeof DOCUMENT_ACTIONS[number];
export type WorkspaceRole = "owner" | "admin" | "member" | "guest";
export type ProjectRole = "admin" | "editor" | "commenter" | "viewer";
export type PermissionMap = Record<DocumentAction, boolean>;
export type DocumentAclRule = { action: DocumentAction; effect: "allow" | "deny"; depth: number };

const PROJECT_ROLE_ACTIONS: Record<ProjectRole, readonly DocumentAction[]> = {
  admin: DOCUMENT_ACTIONS,
  editor: ["document:read", "document:comment", "document:update", "document:publish", "document:move", "document:history"],
  commenter: ["document:read", "document:comment", "document:history"],
  viewer: ["document:read", "document:history"],
};

function emptyPermissions(): PermissionMap {
  return Object.fromEntries(DOCUMENT_ACTIONS.map((action) => [action, false])) as PermissionMap;
}

export function resolveProjectPermissions(workspaceRole: WorkspaceRole, projectRole: ProjectRole | null): PermissionMap {
  if (workspaceRole === "owner") {
    return Object.fromEntries(DOCUMENT_ACTIONS.map((action) => [action, true])) as PermissionMap;
  }
  const permissions = emptyPermissions();
  for (const action of projectRole ? PROJECT_ROLE_ACTIONS[projectRole] : []) permissions[action] = true;
  // Workspace admins may audit every project, but their write authority still
  // comes from an explicit Project role.
  if (workspaceRole === "admin") {
    permissions["document:read"] = true;
    permissions["document:history"] = true;
  }
  return permissions;
}

export function resolveDocumentPermissions(input: {
  workspaceRole: WorkspaceRole;
  projectRole: ProjectRole | null;
  aclRules?: readonly DocumentAclRule[];
}): PermissionMap {
  const permissions = resolveProjectPermissions(input.workspaceRole, input.projectRole);
  if (input.workspaceRole !== "owner" && input.projectRole) {
    const nearestRule = new Map<DocumentAction, DocumentAclRule>();
    for (const rule of [...(input.aclRules ?? [])].sort((a, b) => a.depth - b.depth)) {
      if (!nearestRule.has(rule.action)) nearestRule.set(rule.action, rule);
    }
    for (const [action, rule] of nearestRule) permissions[action] = rule.effect === "allow";
  }
  if (input.workspaceRole === "admin") {
    permissions["document:read"] = true;
    permissions["document:history"] = true;
  }
  if (!permissions["document:read"]) {
    for (const action of DOCUMENT_ACTIONS) permissions[action] = false;
  }
  return permissions;
}

export function hasDocumentPermission(permissions: PermissionMap, action: DocumentAction) {
  return permissions[action] === true;
}

export type CollaborationTokenClaims = {
  version: 1;
  documentId: string;
  workspaceId: string;
  userId: string;
  displayName: string;
  canUpdate: boolean;
  issuedAt: number;
  expiresAt: number;
};

function encode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueCollaborationToken(
  claims: Omit<CollaborationTokenClaims, "version" | "issuedAt" | "expiresAt">,
  secret: string,
  lifetimeSeconds = 120,
  now = Date.now(),
) {
  if (secret.length < 32) throw new Error("COLLABORATION_TOKEN_SECRET must contain at least 32 characters");
  const issuedAt = Math.floor(now / 1000);
  const payload = encode(JSON.stringify({ ...claims, version: 1, issuedAt, expiresAt: issuedAt + lifetimeSeconds }));
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyCollaborationToken(token: string, secret: string, now = Date.now()): CollaborationTokenClaims | null {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra || secret.length < 32) return null;
  const expected = Buffer.from(signature(payload, secret));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CollaborationTokenClaims;
    const nowSeconds = Math.floor(now / 1000);
    if (claims.version !== 1 || !claims.documentId || !claims.workspaceId || !claims.userId ||
      typeof claims.displayName !== "string" || typeof claims.canUpdate !== "boolean" ||
      !Number.isInteger(claims.issuedAt) || !Number.isInteger(claims.expiresAt) ||
      claims.issuedAt > nowSeconds + 30 || claims.expiresAt <= nowSeconds || claims.expiresAt - claims.issuedAt > 300) return null;
    return claims;
  } catch {
    return null;
  }
}
