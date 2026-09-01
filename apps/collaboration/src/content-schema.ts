import {
  BlockNoteEditor,
  BlockNoteSchema,
  createBlockConfig,
  createBlockSpec,
  createInlineContentSpec,
} from "@blocknote/core";

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
