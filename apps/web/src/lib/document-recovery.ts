export type DocumentSnapshot = {
  blocks: unknown[];
  markdown: string;
  plainText: string;
  version: number;
  savedAt: string;
};

export type RecoverySource = "default" | "local" | "postgres";

export type RecoveryResult = {
  snapshot: DocumentSnapshot;
  source: RecoverySource;
  serverVersion: number;
  shouldRestoreToCollaboration: boolean;
};

type DocumentContent = Pick<DocumentSnapshot, "blocks" | "markdown" | "plainText">;

type ServerDocument = {
  blockJson?: unknown;
  markdown?: unknown;
  plainText?: unknown;
  contentVersion?: unknown;
  updatedAt?: unknown;
};

export function createDefaultSnapshot(initialTitle: string): DocumentSnapshot {
  return {
    blocks: [
      { type: "heading", props: { level: 1 }, content: initialTitle },
      { type: "paragraph", content: "开始记录团队知识。支持 Markdown 风格快捷输入、代码块、公式和 Mermaid。" },
      { type: "paragraph", content: "输入 / 打开块菜单，输入 $$ 创建数学公式，输入 ```mermaid 创建技术图表。" },
    ],
    markdown: "",
    plainText: "",
    version: 0,
    savedAt: new Date(0).toISOString(),
  };
}

export function parseLocalSnapshot(value: string | null): DocumentSnapshot | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<DocumentSnapshot>;
    if (!Array.isArray(parsed.blocks)) return null;
    return {
      blocks: parsed.blocks,
      markdown: typeof parsed.markdown === "string" ? parsed.markdown : "",
      plainText: typeof parsed.plainText === "string" ? parsed.plainText : "",
      version: Number.isFinite(Number(parsed.version)) ? Math.max(0, Number(parsed.version)) : 0,
      savedAt: validDate(parsed.savedAt) ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function parseServerSnapshot(value: ServerDocument): DocumentSnapshot | null {
  if (!Array.isArray(value.blockJson)) return null;
  return {
    blocks: value.blockJson,
    markdown: typeof value.markdown === "string" ? value.markdown : "",
    plainText: typeof value.plainText === "string" ? value.plainText : "",
    version: Number.isFinite(Number(value.contentVersion)) ? Math.max(0, Number(value.contentVersion)) : 0,
    savedAt: validDate(value.updatedAt) ?? new Date(0).toISOString(),
  };
}

export function documentContentFingerprint(content: DocumentContent): string {
  return stableStringify(normalizeBlockValue(content.blocks));
}

export function reconcileDocument(
  fallback: DocumentSnapshot,
  local: DocumentSnapshot | null,
  postgres: DocumentSnapshot | null,
): RecoveryResult {
  const serverVersion = postgres?.version ?? 0;

  if (!local && !postgres) {
    return { snapshot: fallback, source: "default", serverVersion, shouldRestoreToCollaboration: false };
  }
  if (!postgres) {
    return {
      snapshot: local ?? fallback,
      source: local ? "local" : "default",
      serverVersion,
      shouldRestoreToCollaboration: Boolean(local),
    };
  }
  if (!local) {
    return { snapshot: postgres, source: "postgres", serverVersion, shouldRestoreToCollaboration: false };
  }

  if (documentContentFingerprint(local) === documentContentFingerprint(postgres)) {
    return { snapshot: postgres, source: "postgres", serverVersion, shouldRestoreToCollaboration: false };
  }

  const localIsNewer = compareSnapshots(local, postgres) > 0;
  return {
    snapshot: localIsNewer ? local : postgres,
    source: localIsNewer ? "local" : "postgres",
    serverVersion,
    shouldRestoreToCollaboration: localIsNewer,
  };
}

function compareSnapshots(left: DocumentSnapshot, right: DocumentSnapshot): number {
  if (left.version !== right.version) return left.version - right.version;
  return Date.parse(left.savedAt) - Date.parse(right.savedAt);
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function normalizeBlockValue(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) return value.map((child) => normalizeBlockValue(child));
  if (!value || typeof value !== "object") return value;

  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "id" || child === undefined) continue;
    if (key === "children" && Array.isArray(child) && child.length === 0) continue;
    if (parentKey === "props" && isDefaultBlockProp(key, child)) continue;

    const normalizedChild = normalizeBlockValue(child, key);
    if (key === "props" && isEmptyObject(normalizedChild)) continue;
    normalized[key] = normalizedChild;
  }
  return normalized;
}

function isDefaultBlockProp(key: string, value: unknown): boolean {
  return (key === "textColor" && value === "default")
    || (key === "backgroundColor" && value === "default")
    || (key === "textAlignment" && value === "left")
    || (key === "isToggleable" && value === false);
}

function isEmptyObject(value: unknown): boolean {
  return value !== null && !Array.isArray(value) && typeof value === "object" && Object.keys(value).length === 0;
}
