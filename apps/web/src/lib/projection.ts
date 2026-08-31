export type Projection = { markdown: string; plainText: string };

type Block = { type?: string; props?: { level?: number; language?: string; checked?: boolean }; content?: unknown; children?: Block[] };

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((item) => {
    if (typeof item !== "object" || item === null) return "";
    if ("text" in item) return String(item.text);
    if ("type" in item && item.type === "math" && "content" in item) return `$${String(item.content)}$`;
    return "";
  }).join("");
}

export function projectBlocks(blocks: unknown[]): Projection {
  const markdown: string[] = [];
  const plain: string[] = [];
  for (const block of blocks as Block[]) {
    const text = textOf(block.content);
    if (!text && !block.children?.length) continue;
    const type = block.type ?? "paragraph";
    if (type === "heading") markdown.push(`${"#".repeat(block.props?.level ?? 1)} ${text}`);
    else if (type === "bulletListItem") markdown.push(`- ${text}`);
    else if (type === "numberedListItem") markdown.push(`1. ${text}`);
    else if (type === "checkListItem") markdown.push(`- [${block.props?.checked ? "x" : " "}] ${text}`);
    else if (type === "codeBlock") markdown.push(`\`\`\`${block.props?.language ?? ""}\n${text}\n\`\`\``);
    else if (type === "mathBlock") markdown.push(`$$\n${text}\n$$`);
    else if (type === "quote") markdown.push(`> ${text}`);
    else markdown.push(text);
    plain.push(text);
  }
  return { markdown: `${markdown.join("\n\n")}\n`, plainText: plain.join("\n") };
}
