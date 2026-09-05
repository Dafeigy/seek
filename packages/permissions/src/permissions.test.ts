import { describe, expect, it } from "vitest";
import { DOCUMENT_ACTIONS, issueCollaborationToken, resolveDocumentPermissions, verifyCollaborationToken } from "./index";

describe("permission matrix", () => {
  it("gives owners every document action", () => {
    const permissions = resolveDocumentPermissions({ workspaceRole: "owner", projectRole: null });
    expect(DOCUMENT_ACTIONS.every((action) => permissions[action])).toBe(true);
  });

  it.each([
    ["admin", ["document:read", "document:comment", "document:update", "document:publish", "document:share", "document:move", "document:delete", "document:restore", "document:history"]],
    ["editor", ["document:read", "document:comment", "document:update", "document:publish", "document:move", "document:history"]],
    ["commenter", ["document:read", "document:comment", "document:history"]],
    ["viewer", ["document:read", "document:history"]],
  ] as const)("maps the %s project role", (projectRole, allowed) => {
    const permissions = resolveDocumentPermissions({ workspaceRole: "member", projectRole });
    expect(DOCUMENT_ACTIONS.filter((action) => permissions[action])).toEqual(allowed);
  });

  it("lets workspace admins read without granting write access", () => {
    const permissions = resolveDocumentPermissions({ workspaceRole: "admin", projectRole: "viewer", aclRules: [
      { action: "document:read", effect: "deny", depth: 0 },
    ] });
    expect(permissions["document:read"]).toBe(true);
    expect(permissions["document:history"]).toBe(true);
    expect(permissions["document:update"]).toBe(false);
  });

  it("uses the nearest inherited ACL and gates every action behind read", () => {
    const allowed = resolveDocumentPermissions({ workspaceRole: "member", projectRole: "viewer", aclRules: [
      { action: "document:comment", effect: "allow", depth: 1 },
      { action: "document:comment", effect: "deny", depth: 0 },
    ] });
    expect(allowed["document:comment"]).toBe(false);

    const denied = resolveDocumentPermissions({ workspaceRole: "member", projectRole: "editor", aclRules: [
      { action: "document:read", effect: "deny", depth: 0 },
    ] });
    expect(DOCUMENT_ACTIONS.every((action) => !denied[action])).toBe(true);
  });

  it("does not let an ACL expand access beyond project membership", () => {
    const permissions = resolveDocumentPermissions({ workspaceRole: "guest", projectRole: null, aclRules: [
      { action: "document:read", effect: "allow", depth: 0 },
    ] });
    expect(permissions["document:read"]).toBe(false);
  });
});

describe("collaboration tokens", () => {
  const secret = "test-secret-with-more-than-thirty-two-characters";
  const claims = { documentId: "doc", workspaceId: "workspace", userId: "user", displayName: "User", canUpdate: true };

  it("round trips short-lived signed claims", () => {
    const token = issueCollaborationToken(claims, secret, 120, 1_000_000);
    expect(verifyCollaborationToken(token, secret, 1_050_000)).toMatchObject(claims);
    expect(verifyCollaborationToken(token, secret, 1_121_000)).toBeNull();
  });

  it("rejects tampering", () => {
    const token = issueCollaborationToken(claims, secret);
    expect(verifyCollaborationToken(`${token}x`, secret)).toBeNull();
  });
});
