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
import { absolutePositionToRelativePosition, ySyncPluginKey } from "y-prosemirror";
import { Check, History, Lock } from "lucide-react";
import { nanoid } from "nanoid";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { resolveCollaborationUrl } from "@/lib/collaboration-url";
import { collaborationCacheName } from "@/lib/collaboration-cache";
import { participantColor } from "@/lib/participant-color";
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

function encodeRelativePosition(position: unknown) {
  if (!position) return null;
  const bytes = Y.encodeRelativePosition(position as Y.RelativePosition);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function SeekEditor({ bootstrap }: Props) {
  const documentId = bootstrap.id;
  const { resolvedTheme } = useTheme();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [localHydrated, setLocalHydrated] = useState(false);
  const [collaborationStatus, setCollaborationStatus] = useState<"connecting" | "syncing" | "connected" | "retrying" | "failed">("connecting");
  const [draftStatus, setDraftStatus] = useState<"idle" | "changed" | "local" | "synced">("idle");
  const [leaseStatus, setLeaseStatus] = useState<"idle" | "requesting" | "held" | "blocked">(bootstrap.canUpdate ? "idle" : "blocked");
  const [leaseHolder, setLeaseHolder] = useState<string | null>(null);
  const [collaborationUrl] = useState(() => resolveCollaborationUrl({
    pageUrl: window.location.href,
    port: process.env.NEXT_PUBLIC_COLLABORATION_PORT,
    explicitUrl: process.env.NEXT_PUBLIC_COLLABORATION_URL,
  }));
  const ydoc = useMemo(() => {
    void documentId;
    return new Y.Doc();
  }, [documentId]);
  const localPersistence = useMemo(() => new IndexeddbPersistence(collaborationCacheName(documentId, bootstrap.collaborationCacheScope), ydoc), [bootstrap.collaborationCacheScope, documentId, ydoc]);
  const provider = useMemo(() => {
    if (!collaborationUrl) return null;
    const websocketProvider = new HocuspocusProviderWebsocket({ url: collaborationUrl, autoConnect: false });
    return new HocuspocusProvider({
      websocketProvider,
      name: documentId,
      document: ydoc,
      token: async () => {
        const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/collaboration-token`, { method: "POST" });
        if (!response.ok) throw new Error(`Collaboration token request failed: ${response.status}`);
        return (await response.json() as { token: string }).token;
      },
    });
  }, [collaborationUrl, documentId, ydoc]);
  const startedProviderRef = useRef<HocuspocusProvider | null>(null);
  const activeBlockRef = useRef<string | null>(null);
  const heldBlockRef = useRef<string | null>(null);
  const pendingBlockRef = useRef<string | null>(null);
  const acquireBlockRef = useRef<((blockId: string) => void) | null>(null);
  const leaseExpiresAtRef = useRef(0);
  const leaseRequestsRef = useRef(new Map<string, "acquire" | "activity" | "release">());
  const pendingDestroyRef = useRef<{ timer: number; provider: HocuspocusProvider | null; persistence: IndexeddbPersistence; ydoc: Y.Doc } | null>(null);
  const uploadFile = useMemo(() => async (file: File) => {
    const form = new FormData();
    form.set("file", file);
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/attachments`, { method: "POST", body: form });
    const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
    if (!response.ok || !result.url) throw new Error(result.error ?? "附件上传失败");
    window.dispatchEvent(new Event("seek:attachments-changed"));
    return result.url;
  }, [documentId]);

  const editor = useCreateBlockNote(
    provider
      ? withCollaboration({
          schema: seekSchema,
          extensions: [syntaxHighlighter],
          dictionary: {
            ...zh,
            placeholders: { ...zh.placeholders, emptyDocument: "从这里开始记录吧" },
            math: mathLocales.zh,
          },
          uploadFile,
          collaboration: {
            provider: { awareness: provider.awareness ?? undefined },
            fragment: ydoc.getXmlFragment("document-store"),
            user: { name: bootstrap.currentUser?.displayName ?? "未知用户", color: participantColor(bootstrap.currentUser?.id ?? "anonymous") },
          },
        })
      : {
          schema: seekSchema,
          extensions: [syntaxHighlighter],
          dictionary: {
            ...zh,
            placeholders: { ...zh.placeholders, emptyDocument: "从这里开始记录吧" },
            math: mathLocales.zh,
          },
          uploadFile,
          initialContent: (bootstrap.blockJson.length ? bootstrap.blockJson : [{ type: "paragraph", content: "" }]) as never,
        },
    [bootstrap.currentUser?.displayName, bootstrap.currentUser?.id, provider, uploadFile, ydoc],
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
      provider.awareness?.setLocalStateField("seekUser", {
        id: bootstrap.currentUser?.id ?? "anonymous",
        displayName: bootstrap.currentUser?.displayName ?? "未知用户",
        color: participantColor(bootstrap.currentUser?.id ?? "anonymous"),
      });
      provider.attach();
      void provider.configuration.websocketProvider.connect();
    }
    return () => {
      provider.off("status", onStatus);
      provider.off("synced", onSynced);
      provider.off("disconnect", onDisconnect);
      provider.off("authenticationFailed", onAuthenticationFailed);
    };
  }, [bootstrap.currentUser?.displayName, bootstrap.currentUser?.id, documentId, localHydrated, provider]);

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
      if (bootstrap.canUpdate && heldBlockRef.current !== currentBlock.id) {
        event.preventDefault();
        return;
      }
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
  }, [bootstrap.canUpdate, documentId, editor, provider]);

  useEffect(() => {
    if (!provider || !bootstrap.canUpdate) return;
    const sendLease = (type: "acquire" | "activity" | "release", blockId: string) => {
      const requestId = typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : nanoid();
      leaseRequestsRef.current.set(requestId, type);
      provider.sendStateless(JSON.stringify({ type: `lease.${type}`, requestId, blockId }));
    };
    const release = (blockId = heldBlockRef.current) => {
      if (!blockId) return;
      sendLease("release", blockId);
      if (heldBlockRef.current === blockId) {
        heldBlockRef.current = null;
        leaseExpiresAtRef.current = 0;
      }
    };
    const acquireBlock = (blockId: string) => {
      if (activeBlockRef.current === blockId && (heldBlockRef.current === blockId || pendingBlockRef.current === blockId)) return;
      if (heldBlockRef.current && heldBlockRef.current !== blockId) release(heldBlockRef.current);
      activeBlockRef.current = blockId;
      pendingBlockRef.current = blockId;
      setLeaseHolder(null);
      setLeaseStatus("requesting");
      sendLease("acquire", blockId);
    };
    acquireBlockRef.current = acquireBlock;
    const acquireCurrentBlock = () => {
      try {
        const blockId = editor.getTextCursorPosition().block.id;
        developmentEvent("block_selection_changed", { documentId, blockId });
        acquireBlock(blockId);
      } catch {
        // There is no cursor until the initial collaborative block arrives.
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!editor.domElement?.contains(event.target as Node)) return;
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-node-type='blockContainer'][data-id], [data-node-type='blockOuter'][data-id]")
        : null;
      const blockId = target?.dataset.id;
      if (blockId) {
        developmentEvent("block_pointer_target", { documentId, blockId });
        acquireBlock(blockId);
      }
    };
    const onStateless = ({ payload }: { payload: string }) => {
      try {
        const message = JSON.parse(payload) as { type?: string; requestId?: string; blockId?: string; granted?: boolean; holderUserId?: string; holderDisplayName?: string };
        if (message.type !== "lease.result" || !message.requestId || !message.blockId) return;
        const operation = leaseRequestsRef.current.get(message.requestId);
        leaseRequestsRef.current.delete(message.requestId);
        if (operation === "activity") {
          if (message.granted) leaseExpiresAtRef.current = Date.now() + 10_000;
          else if (heldBlockRef.current === message.blockId) {
            heldBlockRef.current = null;
            leaseExpiresAtRef.current = 0;
            setLeaseStatus("blocked");
          }
          return;
        }
        if (operation !== "acquire") return;
        if (message.blockId !== activeBlockRef.current) {
          if (message.granted) sendLease("release", message.blockId);
          return;
        }
        pendingBlockRef.current = null;
        if (message.granted) {
          heldBlockRef.current = message.blockId;
          leaseExpiresAtRef.current = Date.now() + 10_000;
          setLeaseStatus("held");
        } else {
          heldBlockRef.current = null;
          leaseExpiresAtRef.current = 0;
          setLeaseHolder(message.holderDisplayName ?? message.holderUserId ?? null);
          setLeaseStatus("blocked");
        }
      } catch {
        // Stateless messages are an extensible channel; ignore other payloads.
      }
    };
    const onSelectionChange = editor.onSelectionChange(acquireCurrentBlock, false);
    const onLocalChange = editor.onChange((_currentEditor, context) => {
      const changedLocally = context.getChanges().some((change) => change.source.type !== "yjs-remote");
      if (changedLocally && heldBlockRef.current) sendLease("activity", heldBlockRef.current);
    }, false);
    const blockUnleasedInput = (event: Event) => {
      if (!editor.domElement?.contains(event.target as Node)) return;
      let blockId = activeBlockRef.current;
      try {
        blockId = editor.getTextCursorPosition().block.id;
      } catch {
        // Fall back to the latest block identified by pointer interaction.
      }
      if (blockId && heldBlockRef.current !== blockId) {
        event.preventDefault();
        acquireBlock(blockId);
      }
    };
    const onFocusOut = (event: FocusEvent) => {
      if (editor.domElement?.contains(event.relatedTarget as Node)) return;
      release();
      activeBlockRef.current = null;
      pendingBlockRef.current = null;
      setLeaseStatus("idle");
    };
    const onPageHide = () => release();
    provider.on("stateless", onStateless);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("beforeinput", blockUnleasedInput, true);
    window.addEventListener("paste", blockUnleasedInput, true);
    window.addEventListener("drop", blockUnleasedInput, true);
    editor.domElement?.addEventListener("focusout", onFocusOut);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      acquireBlockRef.current = null;
      release();
      onSelectionChange();
      onLocalChange();
      provider.off("stateless", onStateless);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("beforeinput", blockUnleasedInput, true);
      window.removeEventListener("paste", blockUnleasedInput, true);
      window.removeEventListener("drop", blockUnleasedInput, true);
      editor.domElement?.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [bootstrap.canUpdate, documentId, editor, provider]);

  useEffect(() => {
    if (!provider?.awareness) return;
    const awareness = provider.awareness;
    const updatePresence = () => {
      const people = new Map<string, { id: string; displayName: string; color: string; isCurrentUser: boolean }>();
      let leases: Array<{ blockId?: string; userId?: string; displayName?: string; expiresAt?: string }> = [];
      for (const state of awareness.getStates().values()) {
        const user = state.seekUser as { id?: string; displayName?: string; color?: string } | undefined;
        if (user?.id && user.displayName) people.set(user.id, {
          id: user.id,
          displayName: user.displayName,
          color: user.color ?? participantColor(user.id),
          isCurrentUser: user.id === bootstrap.currentUser?.id,
        });
        if (Array.isArray(state.blockLeases)) leases = state.blockLeases;
      }
      window.dispatchEvent(new CustomEvent("seek:collaboration-participants", {
        detail: { documentId, participants: [...people.values()] },
      }));
      const heldBlock = heldBlockRef.current;
      if (!heldBlock) return;
      const authoritativeLease = leases.find((lease) => lease.blockId === heldBlock);
      if (authoritativeLease && authoritativeLease.userId === bootstrap.currentUser?.id) {
        const expiresAt = Date.parse(authoritativeLease.expiresAt ?? "");
        if (Number.isFinite(expiresAt)) leaseExpiresAtRef.current = expiresAt;
        return;
      }
      if (authoritativeLease) {
        heldBlockRef.current = null;
        leaseExpiresAtRef.current = 0;
        setLeaseHolder(authoritativeLease.displayName ?? null);
        setLeaseStatus("blocked");
      }
    };
    awareness.on("change", updatePresence);
    updatePresence();
    return () => awareness.off("change", updatePresence);
  }, [bootstrap.currentUser?.id, documentId, provider]);

  useEffect(() => {
    if (!bootstrap.canUpdate) return;
    const stopUnleasedTransactions = editor.onBeforeChange(({ getChanges }) => {
      let localChanges;
      try {
        localChanges = getChanges().filter((change) => change.source.type !== "yjs-remote");
      } catch (error) {
        // Enter splits a block through an intermediate ProseMirror transaction.
        // During that transaction BlockNote can briefly expose a blockContainer
        // without an id, so its change collector throws before the final block
        // is assigned an id. The current block is still the authoritative scope
        // for the lease check; do not turn a valid newline into a runtime error.
        if (error instanceof Error && /blockContainer does not have an ID/.test(error.message)) {
          let currentBlockId: string | null = null;
          try {
            currentBlockId = editor.getTextCursorPosition().block.id;
          } catch {
            // There is no editable cursor before hydration.
          }
          if (currentBlockId && heldBlockRef.current === currentBlockId && leaseExpiresAtRef.current > Date.now()) return;
          if (currentBlockId) acquireBlockRef.current?.(currentBlockId);
          setLeaseStatus("requesting");
          return false;
        }
        throw error;
      }
      if (localChanges.length === 0) return;
      const heldBlock = heldBlockRef.current;
      if (heldBlock && leaseExpiresAtRef.current > Date.now()) {
        // Inserts, deletes and moves all carry their affected block. Treating
        // every insertion as safe here accidentally let a holder of block A
        // create or alter content in block B.
        const onlyHeldBlockChanged = localChanges.every((change) => change.block.id === heldBlock);
        if (onlyHeldBlockChanged) return;
      }
      let currentBlockId: string | null = null;
      try {
        currentBlockId = editor.getTextCursorPosition().block.id;
      } catch {
        // There is no editable cursor before hydration.
      }
      if (currentBlockId) acquireBlockRef.current?.(currentBlockId);
      setLeaseStatus("requesting");
      return false;
    });
    const expiryTimer = window.setInterval(() => {
      if (heldBlockRef.current && leaseExpiresAtRef.current <= Date.now()) {
        heldBlockRef.current = null;
        leaseExpiresAtRef.current = 0;
        setLeaseStatus("idle");
      }
    }, 1_000);
    return () => {
      stopUnleasedTransactions();
      window.clearInterval(expiryTimer);
    };
  }, [bootstrap.canUpdate, editor]);

  useEffect(() => {
    if (!provider) return;
    const onCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ documentId?: string; type?: string; requestId?: string; note?: string; version?: number }>).detail;
      if (detail?.documentId !== documentId || !detail.type || !detail.requestId) return;
      provider.sendStateless(JSON.stringify(detail));
    };
    const onResult = ({ payload }: { payload: string }) => {
      try {
        const detail = JSON.parse(payload) as { type?: string };
        if (detail.type === "document.command.result") {
          window.dispatchEvent(new CustomEvent("seek:document-command-result", { detail: { ...detail, documentId } }));
        }
      } catch {
        // Other stateless messages are handled by their own listeners.
      }
    };
    window.addEventListener("seek:document-command", onCommand);
    provider.on("stateless", onResult);
    return () => {
      window.removeEventListener("seek:document-command", onCommand);
      provider.off("stateless", onResult);
    };
  }, [documentId, provider]);

  useEffect(() => editor.onSelectionChange(() => {
    try {
      const position = editor.getTextCursorPosition();
      const selection = editor.getSelectionCutBlocks();
      const selectedText = selection.blocks.map((block) => blockText(block.content)).filter(Boolean).join("\n").slice(0, 2_000);
      const { startPos, endPos } = selection._meta;
      const binding = ySyncPluginKey.getState(editor.prosemirrorState)?.binding;
      const relativeFrom = binding ? encodeRelativePosition(absolutePositionToRelativePosition(startPos, binding.type, binding.mapping)) : null;
      const relativeTo = binding ? encodeRelativePosition(absolutePositionToRelativePosition(endPos, binding.type, binding.mapping)) : null;
      const contextBefore = editor.prosemirrorState.doc.textBetween(Math.max(0, startPos - 64), startPos, "\n").slice(-64);
      const contextAfter = editor.prosemirrorState.doc.textBetween(endPos, Math.min(editor.prosemirrorState.doc.content.size, endPos + 64), "\n").slice(0, 64);
      window.dispatchEvent(new CustomEvent("seek:comment-anchor", {
        detail: { documentId, blockId: position.block.id, selectedText, from: startPos, to: endPos, relativeFrom, relativeTo, contextBefore, contextAfter },
      }));
    } catch {
      // Selection is unavailable before the collaborative document is hydrated.
    }
  }), [documentId, editor]);

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

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("seek:collaboration-status", {
      detail: {
        documentId,
        label: collaborationLabel,
        connected: online && collaborationStatus === "connected",
      },
    }));
  }, [collaborationLabel, collaborationStatus, documentId, online]);

  const draftLabel = draftStatus === "changed"
    ? "正在保存到本机"
    : draftStatus === "synced"
      ? "实时草稿已同步"
      : draftStatus === "local"
        ? "已保存到本机，等待同步"
    : "等待编辑";
  const leaseLabel = !bootstrap.canUpdate
    ? "只读权限"
    : leaseStatus === "held"
      ? null
      : leaseStatus === "requesting"
        ? "正在申请区块编辑权"
        : leaseStatus === "blocked"
          ? `区块正由 ${leaseHolder ?? "另一位成员"} 编辑`
          : null;

  return <div>
    <div className="flex items-center justify-end px-1 pb-2 text-xs text-muted">
      <span className="flex items-center gap-3">{leaseLabel && <span className="flex items-center gap-1"><Lock size={13} />{leaseLabel}</span>}<span className="flex items-center gap-1">{draftStatus === "synced" ? <Check size={14} className="text-success-foreground" /> : <History size={14} />} {draftLabel}</span><span>草稿 r{bootstrap.contentVersion}</span></span>
    </div>
    <div className="seek-editor min-h-[620px] px-3 py-5 sm:px-12">
      <BlockNoteView editor={editor} theme={resolvedTheme} slashMenu={false} editable={bootstrap.canUpdate === true}>
        <SuggestionMenuController triggerCharacter="/" getItems={async (query) => filterSuggestionItems(combineByGroup(getDefaultReactSlashMenuItems(editor), getMathSlashMenuItems(editor)), query)} />
      </BlockNoteView>
    </div>
  </div>;
}
