import { describe, expect, it } from "vitest";

import { descendantsOf, isValidParent, nextSortOrder } from "./document-tree";

const documents = [
  { id: "root", parentId: null, sortOrder: 1 },
  { id: "child", parentId: "root", sortOrder: 1 },
  { id: "grandchild", parentId: "child", sortOrder: 1 },
  { id: "other", parentId: null, sortOrder: 2 },
];

describe("document tree", () => {
  it("finds the complete descendant set", () => {
    expect(descendantsOf(documents, "root")).toEqual(new Set(["child", "grandchild"]));
  });

  it("rejects moving a document below itself or one of its descendants", () => {
    expect(isValidParent(documents, "root", "root")).toBe(false);
    expect(isValidParent(documents, "root", "grandchild")).toBe(false);
    expect(isValidParent(documents, "child", "other")).toBe(true);
  });

  it("places a new sibling after existing siblings", () => {
    expect(nextSortOrder(documents.filter((document) => document.parentId === null))).toBe(3);
  });
});
