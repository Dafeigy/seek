import { Server } from "@hocuspocus/server";
import postgres from "postgres";
import * as Y from "yjs";

const sql = postgres(process.env.DATABASE_URL ?? "postgresql://seek:seek_dev_password@127.0.0.1:5432/seek");
const server = new Server({
  port: Number(process.env.COLLABORATION_PORT ?? 1234),
  debounce: 5_000,
  maxDebounce: 120_000,
  async onLoadDocument({ documentName }) {
    await sql`
      insert into documents (id, title, project)
      values (${documentName}, ${documentName}, ${"未分类"})
      on conflict (id) do nothing
    `;
    const [row] = await sql`select ydoc_state from documents where id = ${documentName}`;
    if (!row?.ydoc_state) return undefined;
    const document = new Y.Doc();
    Y.applyUpdate(document, new Uint8Array(row.ydoc_state as unknown as Buffer));
    return document;
  },
  async onStoreDocument({ documentName, document }) {
    const state = Buffer.from(Y.encodeStateAsUpdate(document));
    await sql`update documents set ydoc_state = ${state}, updated_at = now() where id = ${documentName}`;
  },
  async onAuthenticate() { return { userId: "demo-editor", role: "editor" }; },
});

server.listen().then(() => console.log("Seek collaboration server listening on :1234"));
