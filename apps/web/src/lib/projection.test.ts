import { describe, expect, it } from "vitest";

import { isEmptyProjection, projectBlocks } from "./projection";

describe("document projection", () => {
  it("treats a blank paragraph as an empty document", () => {
    const projection = projectBlocks([{ type: "paragraph", content: "   " }]);
    expect(isEmptyProjection(projection)).toBe(true);
  });

  it("treats visible text as document content", () => {
    const projection = projectBlocks([{ type: "paragraph", content: [{ type: "text", text: "内容" }] }]);
    expect(isEmptyProjection(projection)).toBe(false);
  });
});
