import { Server } from "@hocuspocus/server";
import { blocksToYDoc, yDocToBlocks } from "@blocknote/core/yjs";
import { performance } from "node:perf_hooks";
import postgres from "postgres";
import * as Y from "yjs";
import { createServerBlockNoteEditor } from "./content-schema.js";

const sql = postgres(process.env.DATABASE_URL ?? "postgresql://seek:seek_dev_password@127.0.0.1:5432/seek");
const port = Number(process.env.COLLABORATION_PORT ?? 1234);
const blockNote = createServerBlockNoteEditor();

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
      return { document, migrated: false };
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
  async onAuthenticate({ documentName, socketId, token }) {
    const startedAt = performance.now();
    if (token !== "demo-editor") {
      log("warn", "authentication_rejected", {
        socketId,
        documentId: documentName,
        reason: "invalid_demo_token",
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw connectionError(4401, "Authentication failed");
    }

    const [document] = await sql`select id from documents where id = ${documentName} and deleted_at is null`;
    if (!document) {
      log("warn", "authentication_rejected", {
        socketId,
        documentId: documentName,
        reason: "document_not_found",
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw connectionError(4404, "Document not found");
    }

    log("info", "document_authenticated", {
      socketId,
      documentId: documentName,
      userId: "demo-editor",
      role: "editor",
      durationMs: Math.round(performance.now() - startedAt),
    });
    return { userId: "demo-editor", role: "editor" };
  },
  async onDisconnect({ documentName, socketId }) {
    log("info", "websocket_disconnected", { documentId: documentName, socketId });
  },
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", "server_stopping", { signal });
  try {
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
