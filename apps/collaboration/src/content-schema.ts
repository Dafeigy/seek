import {
  BlockNoteEditor,
  BlockNoteSchema,
  createBlockConfig,
  createBlockSpec,
  createInlineContentSpec,
} from "@blocknote/core";
import { blocksToYDoc, yDocToBlocks } from "@blocknote/core/yjs";
import * as Y from "yjs";

const mathBlockConfig = createBlockConfig(
  () => ({
    type: "mathBlock" as const,
    propSchema: {},
    content: "plain" as const,
  }),
);

const serverMathBlockSpec = createBlockSpec(mathBlockConfig, {
  meta: {
    code: true,
    defining: true,
    isolating: false,
    highlight: () => "latex",
    hasPreview: true,
  },
  render: () => {
    throw new Error("The headless collaboration schema cannot render math blocks");
  },
});

const serverInlineMathSpec = createInlineContentSpec(
  {
    type: "math" as const,
    propSchema: {},
    content: "plain" as const,
  },
  {
    meta: {
      code: true,
      highlight: () => "latex",
      hasPreview: true,
    },
    render: () => {
      throw new Error("The headless collaboration schema cannot render inline math");
    },
  },
);

export function createServerBlockNoteEditor() {
  return BlockNoteEditor.create({
    schema: BlockNoteSchema.create().extend({
      blockSpecs: { mathBlock: serverMathBlockSpec() },
      inlineContentSpecs: { math: serverInlineMathSpec },
    }),
  });
}

export function ensureDocumentHasBlock(editor: ReturnType<typeof createServerBlockNoteEditor>, document: Y.Doc) {
  if (yDocToBlocks(editor, document, "document-store").length > 0) return false;
  const initialized = blocksToYDoc(editor, [{ type: "paragraph", content: "" }] as never, "document-store");
  Y.applyUpdate(document, Y.encodeStateAsUpdate(initialized));
  return true;
}
