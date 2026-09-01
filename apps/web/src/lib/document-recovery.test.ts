import { describe, expect, it } from "vitest";
import {
  createDefaultSnapshot,
  documentContentFingerprint,
  parseLocalSnapshot,
  reconcileDocument,
  type DocumentSnapshot,
} from "./document-recovery";

const snapshot = (version: number, savedAt: string, text: string): DocumentSnapshot => ({
  blocks: [{ type: "paragraph", content: text }],
  markdown: text,
  plainText: text,
  version,
  savedAt,
});

describe("document recovery", () => {
  it("prefers a newer local recovery copy and marks it for Yjs restoration", () => {
    const result = reconcileDocument(
      createDefaultSnapshot("test"),
      snapshot(3, "2026-08-31T00:00:03.000Z", "local"),
      snapshot(2, "2026-08-31T00:00:02.000Z", "postgres"),
    );

    expect(result.source).toBe("local");
    expect(result.snapshot.plainText).toBe("local");
    expect(result.serverVersion).toBe(2);
    expect(result.shouldRestoreToCollaboration).toBe(true);
  });

  it("prefers PostgreSQL when its version is newer", () => {
    const result = reconcileDocument(
      createDefaultSnapshot("test"),
      snapshot(2, "2026-08-31T00:00:03.000Z", "local"),
      snapshot(3, "2026-08-31T00:00:02.000Z", "postgres"),
    );

    expect(result.source).toBe("postgres");
    expect(result.snapshot.plainText).toBe("postgres");
    expect(result.shouldRestoreToCollaboration).toBe(false);
  });

  it("uses the newest timestamp when versions are equal", () => {
    const result = reconcileDocument(
      createDefaultSnapshot("test"),
      snapshot(4, "2026-08-31T00:00:04.000Z", "local"),
      snapshot(4, "2026-08-31T00:00:03.000Z", "postgres"),
    );

    expect(result.source).toBe("local");
  });

  it("uses PostgreSQL metadata when local and server block content are identical", () => {
    const result = reconcileDocument(
      createDefaultSnapshot("test"),
      snapshot(100, "2026-08-31T00:00:04.000Z", "same"),
      snapshot(0, "2026-08-31T00:00:03.000Z", "same"),
    );

    expect(result.source).toBe("postgres");
    expect(result.snapshot.version).toBe(0);
  });

  it("ignores malformed local storage", () => {
    expect(parseLocalSnapshot("not-json")).toBeNull();
    expect(parseLocalSnapshot('{"blocks":"invalid"}')).toBeNull();
  });

  it("fingerprints block content independent of metadata and object key order", () => {
    const first = snapshot(1, "2026-08-31T00:00:00.000Z", "same");
    const second: DocumentSnapshot = {
      savedAt: "2026-08-31T00:00:01.000Z",
      version: 99,
      plainText: "same",
      markdown: "same",
      blocks: [{ content: "same", type: "paragraph" }],
    };

    expect(documentContentFingerprint(first)).toBe(documentContentFingerprint(second));
  });

  it("ignores BlockNote-generated ids, empty children and default block props", () => {
    const minimal = snapshot(0, "2026-08-31T00:00:00.000Z", "same");
    const hydrated: DocumentSnapshot = {
      ...minimal,
      blocks: [{
        id: "generated-id",
        type: "paragraph",
        props: { textColor: "default", backgroundColor: "default", textAlignment: "left", isToggleable: false },
        content: "same",
        children: [],
      }],
    };

    expect(documentContentFingerprint(hydrated)).toBe(documentContentFingerprint(minimal));
  });
});
