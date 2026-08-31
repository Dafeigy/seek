"use client";

import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { BlockNoteSchema, combineByGroup } from "@blocknote/core";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { zh } from "@blocknote/core/locales";
import { syntaxHighlighter } from "@blocknote/code-block";
import {
  createReactInlineMathSpec,
  createReactMathBlockSpec,
  getMathSlashMenuItems,
  locales as mathLocales,
} from "@blocknote/math-block";
import { BlockNoteView } from "@blocknote/shadcn";
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { Check, CloudOff, History, Wifi } from "lucide-react";
import { projectBlocks } from "@/lib/projection";
import { SeekSlashMenu } from "@/components/editor/seek-slash-menu";
import * as Y from "yjs";

type Props = { documentId: string; initialTitle: string };

const seekSchema = BlockNoteSchema.create().extend({
  blockSpecs: { mathBlock: createReactMathBlockSpec() },
  inlineContentSpecs: { math: createReactInlineMathSpec() },
});

function blockText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => typeof part === "object" && part !== null && "text" in part ? String(part.text) : "").join("");
}

export function SeekEditor({ documentId, initialTitle }: Props) {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [online, setOnline] = useState(true);
  const provider = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_COLLABORATION_URL;
    if (!url) return null;
    return new HocuspocusProvider({ url, name: documentId, document: new Y.Doc(), token: "demo-editor" });
  }, [documentId]);
  const editor = useCreateBlockNote({
    schema: seekSchema,
    extensions: [syntaxHighlighter],
    dictionary: { ...zh, math: mathLocales.zh },
    initialContent: [
      { type: "heading", props: { level: 1 }, content: initialTitle },
      { type: "paragraph", content: "开始记录团队知识。支持 Markdown 风格快捷输入、代码块、公式和 Mermaid。" },
      { type: "paragraph", content: "输入 / 打开块菜单，输入 $$ 创建数学公式，输入 ```mermaid 创建技术图表。" },
    ],
    ...(provider ? { collaboration: { provider, fragment: provider.document.getXmlFragment("document-store"), user: { name: "你", color: "#0f766e" } } } : {}),
  }, [provider]);

  const save = useMemo(() => () => {
    const projection = projectBlocks(editor.document);
    const payload = { blocks: editor.document, ...projection, version: version + 1, savedAt: new Date().toISOString() };
    window.localStorage.setItem(`seek:document:${documentId}`, JSON.stringify(payload));
    setVersion((current) => current + 1);
    setSavedAt(payload.savedAt);
  }, [documentId, editor, version]);

  const handleMarkdownShortcut = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const currentBlock = editor.getTextCursorPosition().block;
    if (currentBlock.type !== "paragraph") return;

    const text = blockText(currentBlock.content).trim();
    if (text === "$$") {
      event.preventDefault();
      editor.updateBlock(currentBlock, { type: "mathBlock", content: "" });
      return;
    }

    const codeFence = text.match(/^```([\w#+.-]*)$/);
    if (codeFence) {
      event.preventDefault();
      editor.updateBlock(currentBlock, {
        type: "codeBlock",
        props: { language: codeFence[1] || "text" },
        content: "",
      });
    }
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 5000);
    };
    const unsubscribe = editor.onChange(onChange);
    const onOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    return () => { if (timer) clearTimeout(timer); unsubscribe(); provider?.destroy(); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOnline); };
  }, [editor, provider, save]);

  return <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
      <span className="flex items-center gap-2">{online ? <Wifi size={14} className="text-emerald-600" /> : <CloudOff size={14} className="text-amber-600" />} {online ? "协作已连接" : "离线编辑，恢复连接后同步"}</span>
      <span className="flex items-center gap-3"><span className="flex items-center gap-1">{savedAt ? <Check size={14} className="text-emerald-600" /> : <History size={14} />} {savedAt ? "已保存" : "自动保存中"}</span><span>v{version}</span></span>
    </div>
    <div className="seek-editor min-h-[620px] px-3 py-5 sm:px-12">
      <BlockNoteView editor={editor} slashMenu={false} onKeyDownCapture={handleMarkdownShortcut}>
        <SuggestionMenuController
          triggerCharacter="/"
          suggestionMenuComponent={SeekSlashMenu}
          getItems={async (query) => filterSuggestionItems(
            combineByGroup(getDefaultReactSlashMenuItems(editor), getMathSlashMenuItems(editor)),
            query,
          )}
        />
      </BlockNoteView>
    </div>
  </div>;
}
