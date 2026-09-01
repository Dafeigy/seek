import { describe, expect, it } from "vitest";

import { createDocumentId, DEFAULT_PROJECT, normalizeProject, normalizeTitle } from "./documents";

describe("document metadata", () => {
  it("normalizes document titles and falls back for blank input", () => {
    expect(normalizeTitle("  Phase   0 收尾  ")).toBe("Phase 0 收尾");
    expect(normalizeTitle("   ")).toBe("未命名文档");
  });

  it("normalizes built-in and user-created project names", () => {
    expect(normalizeProject("算法研究")).toBe("算法研究");
    expect(normalizeProject("  新的   项目  ")).toBe("新的 项目");
    expect(normalizeProject("   ")).toBe(DEFAULT_PROJECT);
    expect(normalizeProject(null, "客户端")).toBe("客户端");
  });

  it("creates unique document IDs without requiring the Web Crypto API", () => {
    const first = createDocumentId();
    const second = createDocumentId();

    expect(first).toMatch(/^document-[A-Za-z0-9_-]{21}$/);
    expect(second).not.toBe(first);
  });
});
