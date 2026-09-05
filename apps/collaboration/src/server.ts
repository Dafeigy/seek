import { Server } from "@hocuspocus/server";
import { blocksToYDoc, yDocToBlocks } from "@blocknote/core/yjs";
import { performance } from "node:perf_hooks";
import postgres from "postgres";
import * as Y from "yjs";
import { resolveDocumentPermissions, verifyCollaborationToken, type ProjectRole, type WorkspaceRole } from "@seek/permissions";
import { createServerBlockNoteEditor, ensureDocumentHasBlock } from "./content-schema.js";

const sql = postgres(process.env.DATABASE_URL ?? "postgresql://seek:seek_dev_password@127.0.0.1:5432/seek");
const port = Number(process.env.COLLABORATION_PORT ?? 1234);
const blockNote = createServerBlockNoteEditor();
const collaborationTokenSecret = process.env.COLLABORATION_TOKEN_SECRET
  ?? (process.env.NODE_ENV === "production" ? "" : "seek-development-collaboration-secret-change-me");

type CollaborationContext = {
  userId: string;
  displayName: string;
  workspaceId: string;
  canUpdate: boolean;
};

type LeaseMessage = {
  type?: string;
  requestId?: string;
  blockId?: string;
};

type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "collaboration",
    event,
    ...fields,
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

function connectionError(code: number, reason: string) {
  return Object.assign(new Error(reason), { code, reason });
}

type Block = {
  type?: string;
  props?: { level?: number; language?: string; checked?: boolean };
  content?: unknown;
  children?: Block[];
};

function blockText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((item) => {
    if (!item || typeof item !== "object") return "";
    if ("text" in item) return String(item.text);
    if ("type" in item && item.type === "math" && "content" in item) return `$${String(item.content)}$`;
    return "";
  }).join("");
}

function projectBlocks(blocks: unknown[]): { markdown: string; plainText: string } {
  const markdown: string[] = [];
  const plainText: string[] = [];

  const visit = (items: Block[], depth = 0) => {
    for (const block of items) {
      const text = blockText(block.content);
      const indent = "  ".repeat(depth);
      switch (block.type) {
        case "heading": markdown.push(`${"#".repeat(block.props?.level ?? 1)} ${text}`); break;
        case "bulletListItem": markdown.push(`${indent}- ${text}`); break;
        case "numberedListItem": markdown.push(`${indent}1. ${text}`); break;
        case "checkListItem": markdown.push(`${indent}- [${block.props?.checked ? "x" : " "}] ${text}`); break;
        case "codeBlock": markdown.push(`\`\`\`${block.props?.language ?? ""}\n${text}\n\`\`\``); break;
        case "mathBlock": markdown.push(`$$\n${text}\n$$`); break;
        case "quote": markdown.push(`> ${text}`); break;
        default: if (text) markdown.push(text);
      }
      if (text) plainText.push(text);
      if (block.children?.length) visit(block.children, depth + 1);
    }
  };

  visit(blocks as Block[]);
  return {
    markdown: markdown.length ? `${markdown.join("\n\n")}\n` : "",
    plainText: plainText.join("\n"),
  };
}

async function loadOrMigrateDocument(documentName: string) {
  return sql.begin(async (tx) => {
    const [row] = await tx`
      select ydoc_state, block_json
      from documents
      where id = ${documentName} and deleted_at is null
      for update
    `;
    if (!row) return null;
    if (row.ydoc_state) {
      const document = new Y.Doc();
      Y.applyUpdate(document, new Uint8Array(row.ydoc_state as unknown as Buffer));
      if (!ensureDocumentHasBlock(blockNote, document)) return { document, migrated: false };

      // Older empty Y.Doc states contain no BlockNote block at all. Seed one
      // paragraph so the user has a concrete block to click and lease.
      const state = Buffer.from(Y.encodeStateAsUpdate(document));
      await tx`
        update documents
        set ydoc_state = ${state}, ydoc_initialized_at = coalesce(ydoc_initialized_at, now())
        where id = ${documentName}
      `;
      return { document, migrated: true };
    }

    const sourceBlocks = Array.isArray(row.block_json) && row.block_json.length
      ? row.block_json
      : [{ type: "paragraph", content: "" }];
    // The row lock makes conversion from the legacy whole-document JSON a
    // single-writer operation across collaboration service instances.
    const document = blocksToYDoc(blockNote, sourceBlocks as never, "document-store");
    const state = Buffer.from(Y.encodeStateAsUpdate(document));
    await tx`
      update documents
      set ydoc_state = ${state}, ydoc_initialized_at = now()
      where id = ${documentName}
    `;
    return { document, migrated: true };
  });
}

async function currentDocumentPermissions(documentId: string, userId: string, workspaceId: string) {
  const [membership] = await sql`
    select wm.role as workspace_role, pm.role as project_role
    from documents d
    join workspace_members wm on wm.workspace_id = ${workspaceId} and wm.user_id = ${userId}
    left join project_members pm on pm.project_name = d.project and pm.user_id = ${userId}
    where d.id = ${documentId} and d.deleted_at is null
  `;
  if (!membership) return null;
  const aclRules = await sql`
    with recursive ancestors as (
      select id, parent_id, 0 as depth from documents where id = ${documentId}
      union all
      select parent.id, parent.parent_id, ancestors.depth + 1
      from documents parent join ancestors on ancestors.parent_id = parent.id
    )
    select acl.action, acl.effect, ancestors.depth
    from ancestors join document_acl acl on acl.document_id = ancestors.id
    where acl.user_id = ${userId}
    order by ancestors.depth asc
  `;
  return resolveDocumentPermissions({
    workspaceRole: membership.workspace_role as WorkspaceRole,
    projectRole: (membership.project_role as ProjectRole | null) ?? null,
    aclRules: aclRules.map((rule) => ({ action: rule.action, effect: rule.effect, depth: Number(rule.depth) })),
  });
}

async function broadcastLeases(documentName: string, document?: { awareness: { setLocalStateField: (field: string, value: unknown) => void } }) {
  if (!document) return;
  const leases = await sql`
    select leases.block_id, leases.user_id, users.display_name, leases.acquired_at, leases.active_at, leases.expires_at
    from document_block_leases leases join users on users.id = leases.user_id
    where leases.document_id = ${documentName} and leases.expires_at > now()
    order by leases.acquired_at asc
  `;
  document.awareness.setLocalStateField("blockLeases", leases.map((lease) => ({
    blockId: lease.block_id,
    userId: lease.user_id,
    displayName: lease.display_name,
    acquiredAt: new Date(lease.acquired_at).toISOString(),
    activeAt: new Date(lease.active_at).toISOString(),
    expiresAt: new Date(lease.expires_at).toISOString(),
  })));
}

async function handleLeaseMessage(input: {
  documentName: string;
  document: { awareness: { setLocalStateField: (field: string, value: unknown) => void } };
  connection: { context: CollaborationContext; socketId: string; sendStateless: (payload: string) => void };
  payload: string;
}) {
  let message: LeaseMessage;
  try {
    message = JSON.parse(input.payload) as LeaseMessage;
  } catch {
    return;
  }
  if (!message.type?.startsWith("lease.") || typeof message.blockId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(message.blockId)) return;
  const context = input.connection.context;
  const reply = (granted: boolean, holderUserId?: string, holderDisplayName?: string) => input.connection.sendStateless(JSON.stringify({
    type: "lease.result",
    requestId: message.requestId,
    blockId: message.blockId,
    granted,
    holderUserId,
    holderDisplayName,
  }));

  if (!context.canUpdate) {
    reply(false);
    return;
  }

  if (message.type === "lease.acquire") {
    const rows = await sql.begin(async (tx) => {
      await tx`delete from document_block_leases where document_id = ${input.documentName} and block_id = ${message.blockId!} and expires_at <= now()`;
      await tx`
        insert into document_block_leases (document_id, block_id, user_id, connection_id)
        values (${input.documentName}, ${message.blockId!}, ${context.userId}, ${input.connection.socketId})
        on conflict (document_id, block_id) do nothing
      `;
      return tx`
        select leases.user_id, leases.connection_id, users.display_name
        from document_block_leases leases join users on users.id = leases.user_id
        where leases.document_id = ${input.documentName} and leases.block_id = ${message.blockId!} and leases.expires_at > now()
      `;
    });
    const lease = rows[0];
    const granted = lease?.user_id === context.userId && lease?.connection_id === input.connection.socketId;
    reply(granted, lease?.user_id, lease?.display_name);
    await broadcastLeases(input.documentName, input.document);
    return;
  }

  if (message.type === "lease.activity") {
    const [lease] = await sql`
      update document_block_leases
      set active_at = now(), expires_at = now() + interval '60 seconds'
      where document_id = ${input.documentName} and block_id = ${message.blockId}
        and user_id = ${context.userId} and connection_id = ${input.connection.socketId} and expires_at > now()
      returning user_id
    `;
    reply(Boolean(lease), lease?.user_id);
    if (lease) await broadcastLeases(input.documentName, input.document);
    return;
  }

  if (message.type === "lease.release") {
    const [lease] = await sql`
      delete from document_block_leases
      where document_id = ${input.documentName} and block_id = ${message.blockId}
        and user_id = ${context.userId} and connection_id = ${input.connection.socketId}
      returning user_id
    `;
    reply(Boolean(lease));
    if (lease) await broadcastLeases(input.documentName, input.document);
  }
}

const server = new Server({
  port,
  debounce: 5_000,
  maxDebounce: 120_000,
  async onRequest({ request, response }) {
    if (request.url !== "/healthz") return;
    const startedAt = performance.now();
    try {
      await sql`select 1`;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok", database: "connected" }));
      log("info", "health_check", { healthy: true, durationMs: Math.round(performance.now() - startedAt) });
    } catch (error) {
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "unavailable", database: "disconnected" }));
      log("error", "health_check", {
        healthy: false,
        durationMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : "Unknown database error",
      });
    }
    // Hocuspocus uses an empty rejection to suppress its default HTTP body.
    throw null;
  },
  async onConnect({ request, socketId }) {
    log("info", "websocket_connected", {
      socketId,
      remoteAddress: request.socket.remoteAddress,
      origin: request.headers.origin,
    });
  },
  async onLoadDocument({ documentName, socketId }) {
    const startedAt = performance.now();
    const loaded = await loadOrMigrateDocument(documentName);
    if (!loaded) {
      log("warn", "document_load_rejected", {
        socketId,
        documentId: documentName,
        reason: "not_found",
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw connectionError(4404, "Document not found");
    }
    const state = Y.encodeStateAsUpdate(loaded.document);
    log("info", "document_loaded", {
      socketId,
      documentId: documentName,
      ydocBytes: state.byteLength,
      migratedFromBlockJson: loaded.migrated,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return loaded.document;
  },
  async afterLoadDocument({ documentName, document }) {
    await broadcastLeases(documentName, document);
  },
  async onStoreDocument({ documentName, document, socketId }) {
    const startedAt = performance.now();
    const state = Buffer.from(Y.encodeStateAsUpdate(document));
    let blocks: unknown[] | null = null;
    let projection: { markdown: string; plainText: string } | null = null;
    try {
      blocks = yDocToBlocks(blockNote, document, "document-store") as unknown[];
      projection = projectBlocks(blocks);
    } catch (error) {
      log("error", "document_projection_failed", {
        socketId,
        documentId: documentName,
        error: error instanceof Error ? error.message : "Unknown projection error",
      });
    }

    const [stored] = projection && blocks
      ? await sql`
          update documents
          set ydoc_state = ${state},
              block_json = ${sql.json(blocks as never)},
              markdown = ${projection.markdown},
              plain_text = ${projection.plainText},
              content_version = content_version + 1,
              projected_at = now(),
              updated_at = now()
          where id = ${documentName} and deleted_at is null
          returning id, content_version
        `
      : await sql`
          update documents
          set ydoc_state = ${state}, updated_at = now()
          where id = ${documentName} and deleted_at is null
          returning id, content_version
        `;
    if (!stored) {
      log("error", "document_store_failed", {
        socketId,
        documentId: documentName,
        reason: "not_found",
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw new Error("Cannot store a collaboration document that no longer exists");
    }
    log("info", "document_stored", {
      socketId,
      documentId: documentName,
      ydocBytes: state.byteLength,
      projected: Boolean(projection),
      contentVersion: Number(stored.content_version),
      durationMs: Math.round(performance.now() - startedAt),
    });
  },
  async onAuthenticate({ documentName, socketId, token, connectionConfig }) {
    const startedAt = performance.now();
    const claims = verifyCollaborationToken(token, collaborationTokenSecret);
    if (!claims || claims.documentId !== documentName) {
      log("warn", "authentication_rejected", {
        socketId,
        documentId: documentName,
        reason: "invalid_or_expired_token",
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw connectionError(4401, "Authentication failed");
    }

    const permissions = await currentDocumentPermissions(documentName, claims.userId, claims.workspaceId);
    if (!permissions?.["document:read"]) {
      log("warn", "authentication_rejected", {
        socketId,
        documentId: documentName,
        reason: "document_not_found_or_forbidden",
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw connectionError(4404, "Document not found");
    }

    connectionConfig.readOnly = !permissions["document:update"];
    const context: CollaborationContext = {
      userId: claims.userId,
      displayName: claims.displayName,
      workspaceId: claims.workspaceId,
      canUpdate: permissions["document:update"],
    };
    log("info", "document_authenticated", {
      socketId,
      documentId: documentName,
      userId: claims.userId,
      readOnly: connectionConfig.readOnly,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return context;
  },
  async onStateless({ documentName, document, connection, payload }) {
    await handleLeaseMessage({ documentName, document, connection: connection as never, payload });
  },
  async onDisconnect({ documentName, document, socketId }) {
    await sql`delete from document_block_leases where connection_id = ${socketId}`;
    await broadcastLeases(documentName, document);
    log("info", "websocket_disconnected", { documentId: documentName, socketId });
  },
});

const leaseExpiryTimer = setInterval(() => {
  void sql`delete from document_block_leases where expires_at <= now() returning document_id`.then((expired) => {
    for (const documentId of new Set(expired.map((row) => String(row.document_id)))) {
      const document = server.hocuspocus.documents.get(documentId);
      if (document) void broadcastLeases(documentId, document);
    }
  }).catch((error) => log("error", "lease_expiry_failed", { error: error instanceof Error ? error.message : "Unknown error" }));
}, 5_000);
leaseExpiryTimer.unref();

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", "server_stopping", { signal });
  try {
    clearInterval(leaseExpiryTimer);
    await server.destroy();
    await sql.end({ timeout: 10 });
    log("info", "server_stopped", { signal });
    process.exit(0);
  } catch (error) {
    log("error", "server_stop_failed", { signal, error: error instanceof Error ? error.message : "Unknown error" });
    process.exit(1);
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

server.listen().then(() => log("info", "server_listening", { address: "0.0.0.0", port }));
