import assert from "node:assert/strict";
import test from "node:test";
import { blocksToYDoc, yDocToBlocks } from "@blocknote/core/yjs";
import { createServerBlockNoteEditor } from "./content-schema.js";

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
