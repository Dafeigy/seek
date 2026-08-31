import { NextResponse } from "next/server";
import { db } from "@/lib/server-db";

export async function POST(_: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const { id, version } = await params;
  const [source] = await db`select block_json, markdown from document_versions where document_id = ${id} and version = ${Number(version)}`;
  const [current] = await db`select content_version from documents where id = ${id}`;
  if (!source || !current) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  const nextVersion = Number(current.content_version) + 1;
  const plainText = String(source.markdown).replace(/[#>*_`\[\]-]/g, "").replace(/\n{2,}/g, "\n").trim();
  await db.begin(async (tx) => {
    await tx`update documents set block_json = ${tx.json(source.block_json)}, markdown = ${source.markdown}, plain_text = ${plainText}, content_version = ${nextVersion}, updated_at = now() where id = ${id}`;
    await tx`insert into document_versions (document_id, version, block_json, markdown, reason) values (${id}, ${nextVersion}, ${tx.json(source.block_json)}, ${source.markdown}, ${"restore:" + version})`;
  });
  return NextResponse.json({ version: nextVersion, restoredFrom: Number(version) });
}
