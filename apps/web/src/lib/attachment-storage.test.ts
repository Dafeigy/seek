import { describe, expect, it } from "vitest";

import { detectedMimeType, safeFileName, validateMimeType } from "./attachment-storage";

describe("attachment storage validation", () => {
  it("removes path components from file names", () => {
    expect(safeFileName("../../secret.txt")).toBe("secret.txt");
  });

  it("detects common binary signatures", () => {
    expect(detectedMimeType(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png")).toBe("image/png");
    expect(() => validateMimeType(Uint8Array.from([0xff, 0xd8, 0xff]), "image/png", "image.png")).toThrow(/不一致/);
    expect(() => validateMimeType(Uint8Array.from([0xff, 0xd8, 0xff]), "image/jpeg", "image.png")).toThrow(/扩展名/);
    expect(validateMimeType(new TextEncoder().encode('{"ok":true}'), "application/json", "data.json")).toBe("application/json");
    expect(() => validateMimeType(new TextEncoder().encode("not json"), "application/json", "data.json")).toThrow(/不支持/);
  });
});
