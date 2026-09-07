import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const allowedTypes = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf", "text/plain", "text/markdown", "text/csv",
  "application/zip", "application/json",
]);
const extensionsByType: Record<string, string[]> = {
  "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/gif": [".gif"], "image/webp": [".webp"],
  "image/svg+xml": [".svg"], "application/pdf": [".pdf"], "text/plain": [".txt"],
  "text/markdown": [".md", ".markdown"], "text/csv": [".csv"], "application/zip": [".zip"], "application/json": [".json"],
};

function attachmentRoot() {
  if (process.env.STORAGE_LOCAL_DIR) return path.resolve(process.env.STORAGE_LOCAL_DIR);
  if (process.env.ATTACHMENTS_DIR) return path.resolve(process.env.ATTACHMENTS_DIR);
  return path.resolve(process.cwd(), "../../.data/attachments");
}

export function safeFileName(value: string) {
  const normalized = path.basename(value).normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (normalized || "attachment").slice(0, 240);
}

export function detectedMimeType(bytes: Uint8Array, declared: string) {
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (new TextDecoder().decode(bytes.slice(0, 6)) === "GIF87a" || new TextDecoder().decode(bytes.slice(0, 6)) === "GIF89a") return "image/gif";
  if (new TextDecoder().decode(bytes.slice(0, 4)) === "%PDF") return "application/pdf";
  if (new TextDecoder().decode(bytes.slice(0, 2)) === "PK") return "application/zip";
  if (new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  const declaredType = declared.toLowerCase().split(";", 1)[0];
  let text = "";
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return "application/octet-stream";
  }
  if (text.includes("\0")) return "application/octet-stream";
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  if (declaredType === "image/svg+xml" && /^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(trimmed)) return "image/svg+xml";
  if (declaredType === "application/json") {
    try { JSON.parse(text); return "application/json"; } catch { return "application/octet-stream"; }
  }
  if (["text/plain", "text/markdown", "text/csv"].includes(declaredType)) return declaredType;
  return "application/octet-stream";
}

export function validateMimeType(bytes: Uint8Array, declared: string, fileName = "") {
  const detected = detectedMimeType(bytes, declared);
  if (!allowedTypes.has(detected)) throw new Error("不支持该文件类型");
  if (declared && declared !== "application/octet-stream" && detected !== declared.toLowerCase().split(";", 1)[0]) {
    throw new Error("文件内容与声明类型不一致");
  }
  const extension = path.extname(fileName).toLowerCase();
  if (!extension || !extensionsByType[detected]?.includes(extension)) throw new Error("文件扩展名与内容类型不一致");
  return detected;
}

export async function putAttachment(storageKey: string, bytes: Uint8Array) {
  const root = attachmentRoot();
  const target = path.resolve(root, storageKey);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("附件路径无效");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
  return createHash("sha256").update(bytes).digest("hex");
}

export async function getAttachment(storageKey: string) {
  const root = attachmentRoot();
  const target = path.resolve(root, storageKey);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("附件路径无效");
  return readFile(target);
}

export async function removeAttachment(storageKey: string) {
  const root = attachmentRoot();
  const target = path.resolve(root, storageKey);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("附件路径无效");
  await unlink(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
