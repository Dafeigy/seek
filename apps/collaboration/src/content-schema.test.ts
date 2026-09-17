import assert from "node:assert/strict";
import test from "node:test";
import { blocksToYDoc, yDocToBlocks } from "@blocknote/core/yjs";
import * as Y from "yjs";
import { createServerBlockNoteEditor, ensureDocumentHasBlock, replaceDocumentBlocks } from "./content-schema.js";

test("the headless schema loads in Node and round-trips math content", () => {
  const editor = createServerBlockNoteEditor();
  const source = [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "inline ", styles: {} },
        { type: "math", props: {}, content: "x+y" },
      ],
    },
    { type: "mathBlock", props: {}, content: "a^2" },
  ];

  const document = blocksToYDoc(editor, source as never, "document-store");
  const restored = yDocToBlocks(editor, document, "document-store");

  assert.match(JSON.stringify(restored), /"type":"math"/);
  assert.match(JSON.stringify(restored), /"type":"mathBlock"/);
  assert.match(JSON.stringify(restored), /x\+y/);
  assert.match(JSON.stringify(restored), /a\^2/);
});

test("an empty collaborative document receives an editable paragraph", () => {
  const editor = createServerBlockNoteEditor();
  const document = new Y.Doc();

  assert.equal(ensureDocumentHasBlock(editor, document), true);
  const blocks = yDocToBlocks(editor, document, "document-store");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.type, "paragraph");
  assert.equal(ensureDocumentHasBlock(editor, document), false);
});

test("version restore replaces the active Y.Doc instead of merging old content", () => {
  const editor = createServerBlockNoteEditor();
  const document = blocksToYDoc(editor, [
    { type: "paragraph", content: "newer draft that must disappear" },
    { type: "paragraph", content: "second draft block" },
  ] as never, "document-store");

  replaceDocumentBlocks(editor, document, [{ type: "paragraph", content: "published snapshot" }]);

  const restored = yDocToBlocks(editor, document, "document-store");
  assert.equal(restored.length, 1);
  assert.match(JSON.stringify(restored), /published snapshot/);
  assert.doesNotMatch(JSON.stringify(restored), /newer draft/);
});
