"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { BlockNoteSchema, combineByGroup } from "@blocknote/core";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { zh } from "@blocknote/core/locales";
import { withCollaboration } from "@blocknote/core/yjs";
import { syntaxHighlighter } from "@blocknote/code-block";
import { createReactInlineMathSpec, createReactMathBlockSpec, getMathSlashMenuItems, locales as mathLocales } from "@blocknote/math-block";
import { BlockNoteView } from "@blocknote/shadcn";
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { Check, CloudOff, History, Wifi } from "lucide-react";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { resolveCollaborationUrl } from "@/lib/collaboration-url";
import { collaborationCacheName } from "@/lib/collaboration-cache";
import { useTheme } from "@/components/theme-provider";
import type { DocumentBootstrap } from "@/lib/documents";

type Props = { bootstrap: DocumentBootstrap };

const seekSchema = BlockNoteSchema.create().extend({
  blockSpecs: { mathBlock: createReactMathBlockSpec() },
  inlineContentSpecs: { math: createReactInlineMathSpec() },
});

function blockText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => typeof part === "object" && part !== null && "text" in part ? String(part.text) : "").join("");
}

function developmentEvent(event: string, fields: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV !== "development") return;
  console.info(JSON.stringify({ timestamp: new Date().toISOString(), service: "web-collaboration", event, ...fields }));
}

export function SeekEditor({ bootstrap }: Props) {
  const documentId = bootstrap.id;
  const { resolvedTheme } = useTheme();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [localHydrated, setLocalHydrated] = useState(false);
  const [collaborationStatus, setCollaborationStatus] = useState<"connecting" | "syncing" | "connected" | "retrying" | "failed">("connecting");
  const [draftStatus, setDraftStatus] = useState<"idle" | "changed" | "local" | "synced">("idle");
  const [collaborationUrl] = useState(() => resolveCollaborationUrl({
    pageUrl: window.location.href,
    port: process.env.NEXT_PUBLIC_COLLABORATION_PORT,
    explicitUrl: process.env.NEXT_PUBLIC_COLLABORATION_URL,
  }));
  const ydoc = useMemo(() => {
    void documentId;
    return new Y.Doc();
  }, [documentId]);
  const localPersistence = useMemo(() => new IndexeddbPersistence(collaborationCacheName(documentId), ydoc), [documentId, ydoc]);
  const provider = useMemo(() => {
    if (!collaborationUrl) return null;
    const websocketProvider = new HocuspocusProviderWebsocket({ url: collaborationUrl, autoConnect: false });
    return new HocuspocusProvider({
      websocketProvider,
      name: documentId,
      document: ydoc,
      token: "demo-editor",
    });
  }, [collaborationUrl, documentId, ydoc]);
  const startedProviderRef = useRef<HocuspocusProvider | null>(null);
  const pendingDestroyRef = useRef<{ timer: number; provider: HocuspocusProvider | null; persistence: IndexeddbPersistence; ydoc: Y.Doc } | null>(null);

  const editor = useCreateBlockNote(
    provider
      ? withCollaboration({
          schema: seekSchema,
          extensions: [syntaxHighlighter],
          dictionary: { ...zh, math: mathLocales.zh },
          collaboration: {
            provider: { awareness: provider.awareness ?? undefined },
            fragment: ydoc.getXmlFragment("document-store"),
            user: { name: "你", color: "#0f766e" },
          },
        })
      : {
          schema: seekSchema,
          extensions: [syntaxHighlighter],
          dictionary: { ...zh, math: mathLocales.zh },
          initialContent: (bootstrap.blockJson.length ? bootstrap.blockJson : [{ type: "paragraph", content: "" }]) as never,
        },
    [provider, ydoc],
  );

  useEffect(() => {
    let cancelled = false;
    developmentEvent("document_bootstrap_finished", { documentId, contentVersion: bootstrap.contentVersion });
    void localPersistence.whenSynced.then(() => {
      if (cancelled) return;
      setLocalHydrated(true);
      setDraftStatus("local");
      developmentEvent("local_ydoc_hydrated", { documentId });
    });
    return () => { cancelled = true; };
  }, [bootstrap.contentVersion, documentId, localPersistence]);

  useEffect(() => {
    if (!provider || !localHydrated) return;
    let authenticationFailed = false;
    const onStatus = ({ status }: { status: string }) => {
      if (authenticationFailed) return;
      if (status === "connected") {
        setCollaborationStatus(provider.synced ? "connected" : "syncing");
        developmentEvent("ws_open", { documentId });
      } else if (status === "disconnected") {
        setCollaborationStatus("retrying");
      } else {
        setCollaborationStatus("connecting");
        developmentEvent("ws_connecting", { documentId });
      }
    };
    const onSynced = ({ state }: { state: boolean }) => {
      if (!state) return;
      setCollaborationStatus("connected");
      setDraftStatus("synced");
      developmentEvent("yjs_synced", { documentId });
    };
    const onDisconnect = ({ event }: { event: CloseEvent }) => {
      developmentEvent("ws_closed", { documentId, code: event.code, reason: event.reason || undefined });
      setCollaborationStatus(authenticationFailed ? "failed" : "retrying");
    };
    const onAuthenticationFailed = () => {
      authenticationFailed = true;
      setCollaborationStatus("failed");
      developmentEvent("authentication_failed", { documentId });
    };

    provider.on("status", onStatus);
    provider.on("synced", onSynced);
    provider.on("disconnect", onDisconnect);
    provider.on("authenticationFailed", onAuthenticationFailed);
    if (provider.synced) onSynced({ state: true });
    if (startedProviderRef.current !== provider) {
      startedProviderRef.current = provider;
      provider.attach();
      void provider.configuration.websocketProvider.connect();
    }
    return () => {
      provider.off("status", onStatus);
      provider.off("synced", onSynced);
      provider.off("disconnect", onDisconnect);
      provider.off("authenticationFailed", onAuthenticationFailed);
    };
  }, [documentId, localHydrated, provider]);

  useEffect(() => {
    const pending = pendingDestroyRef.current;
    if (pending) {
      window.clearTimeout(pending.timer);
      if (pending.provider !== provider || pending.ydoc !== ydoc) {
        pending.provider?.destroy();
        void pending.persistence.destroy();
        pending.ydoc.destroy();
      }
      pendingDestroyRef.current = null;
    }
    return () => {
      const timer = window.setTimeout(() => {
        provider?.destroy();
        void localPersistence.destroy();
        ydoc.destroy();
        if (pendingDestroyRef.current?.ydoc === ydoc) pendingDestroyRef.current = null;
      }, 0);
      pendingDestroyRef.current = { timer, provider, persistence: localPersistence, ydoc };
    };
  }, [localPersistence, provider, ydoc]);

  useEffect(() => {
    let settledTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = editor.onChange(() => {
      setDraftStatus("changed");
      if (settledTimer) clearTimeout(settledTimer);
      settledTimer = setTimeout(() => setDraftStatus(provider?.synced ? "synced" : "local"), 1200);
    });
    const onOnline = () => setOnline(navigator.onLine);
    const onKeyDown = (event: KeyboardEvent) => {
      if (!editor.domElement?.contains(event.target as Node)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setDraftStatus(provider?.synced ? "synced" : "local");
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      const currentBlock = editor.getTextCursorPosition().block;
      if (currentBlock.type !== "paragraph") return;
      const text = blockText(currentBlock.content).trim();
      const codeFence = text.match(/^```([\w#+.-]*)$/);
      if (text !== "$$" && !codeFence) return;
      event.preventDefault();
      const replacement = text === "$$"
        ? { type: "mathBlock" as const, content: "" }
        : { type: "codeBlock" as const, props: { language: codeFence?.[1] || "text" }, content: "" };
      const { insertedBlocks } = editor.replaceBlocks([currentBlock], [replacement]);
      if (insertedBlocks[0]) editor.setTextCursorPosition(insertedBlocks[0], "start");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    window.addEventListener("keydown", onKeyDown, true);
    developmentEvent("editor_editable", { documentId });
    return () => {
      if (settledTimer) clearTimeout(settledTimer);
      unsubscribe();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [documentId, editor, provider]);

  const collaborationLabel = !online
    ? "网络离线，本地编辑中"
    : !localHydrated
      ? "正在恢复本地草稿"
      : collaborationStatus === "connected"
        ? "协作已连接"
        : collaborationStatus === "syncing"
          ? "正在同步文档"
          : collaborationStatus === "failed"
            ? "协作认证失败，本地更改尚未上传"
            : collaborationStatus === "retrying"
              ? "协作连接失败，正在重试"
              : "协作连接中";
  const draftLabel = draftStatus === "changed"
    ? "正在保存到本机"
    : draftStatus === "synced"
      ? "实时草稿已同步"
      : draftStatus === "local"
        ? "已保存到本机，等待同步"
        : "等待编辑";

  return <div className="rounded-2xl border border-border bg-card shadow-sm">
    <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted">
      <span className="flex items-center gap-2">{online && collaborationStatus === "connected" ? <Wifi size={14} className="text-success-foreground" /> : <CloudOff size={14} className="text-amber-600 dark:text-amber-400" />} {collaborationLabel}</span>
      <span className="flex items-center gap-3"><span className="flex items-center gap-1">{draftStatus === "synced" ? <Check size={14} className="text-success-foreground" /> : <History size={14} />} {draftLabel}</span><span>草稿 r{bootstrap.contentVersion}</span></span>
    </div>
    <div className="seek-editor min-h-[620px] px-3 py-5 sm:px-12">
      <BlockNoteView editor={editor} theme={resolvedTheme} slashMenu={false} editable>
        <SuggestionMenuController triggerCharacter="/" getItems={async (query) => filterSuggestionItems(combineByGroup(getDefaultReactSlashMenuItems(editor), getMathSlashMenuItems(editor)), query)} />
      </BlockNoteView>
    </div>
  </div>;
}
