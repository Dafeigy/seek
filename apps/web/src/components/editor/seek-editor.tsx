"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { isEmptyProjection, projectBlocks } from "@/lib/projection";
import { resolveCollaborationUrl } from "@/lib/collaboration-url";
import {
  createDefaultSnapshot,
  documentContentFingerprint,
  parseLocalSnapshot,
  parseServerSnapshot,
  reconcileDocument,
  type DocumentSnapshot,
  type RecoveryResult,
} from "@/lib/document-recovery";
import * as Y from "yjs";

type Props = { documentId: string; initialTitle: string; initialProject: string };

const seekSchema = BlockNoteSchema.create().extend({
  blockSpecs: { mathBlock: createReactMathBlockSpec() },
  inlineContentSpecs: { math: createReactInlineMathSpec() },
});

function blockText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => typeof part === "object" && part !== null && "text" in part ? String(part.text) : "").join("");
}

const cacheKey = (documentId: string) => `seek:document:${documentId}`;

function formatSavedTime(savedAt: string | null): string {
  if (!savedAt) return "";
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function SeekEditor({ documentId, initialTitle, initialProject }: Props) {
  const [recovery, setRecovery] = useState<RecoveryResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const fallback = createDefaultSnapshot(initialTitle);
    const local = parseLocalSnapshot(window.localStorage.getItem(cacheKey(documentId)));

    void fetch(`/api/documents/${encodeURIComponent(documentId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Document load failed: ${response.status}`);
        return parseServerSnapshot(await response.json());
      })
      .then((postgres) => {
        const result = reconcileDocument(fallback, local, postgres);
        if (result.source === "postgres") {
          window.localStorage.setItem(cacheKey(documentId), JSON.stringify(result.snapshot));
        }
        setRecovery(result);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("PostgreSQL document recovery failed; using local recovery data.", error);
        setRecovery(reconcileDocument(fallback, local, null));
      });

    return () => controller.abort();
  }, [documentId, initialTitle]);

  if (!recovery) {
    return <div className="h-[680px] animate-pulse rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-400">正在对比本地缓存与 PostgreSQL…</div>;
  }

  return <RecoveredSeekEditor documentId={documentId} initialTitle={initialTitle} initialProject={initialProject} recovery={recovery} />;
}

function RecoveredSeekEditor({ documentId, initialTitle, initialProject, recovery }: Props & { recovery: RecoveryResult }) {
  const [collaborationUrl] = useState(() => resolveCollaborationUrl({
    pageUrl: window.location.href,
    port: process.env.NEXT_PUBLIC_COLLABORATION_PORT,
    explicitUrl: process.env.NEXT_PUBLIC_COLLABORATION_URL,
  }));
  const [savedAt, setSavedAt] = useState<string | null>(recovery.snapshot.version > 0 ? recovery.snapshot.savedAt : null);
  const [version, setVersion] = useState(recovery.snapshot.version);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [collaborationStatus, setCollaborationStatus] = useState<"local" | "connecting" | "syncing" | "connected" | "retrying" | "failed">(
    collaborationUrl ? "connecting" : "local",
  );
  const [saveStatus, setSaveStatus] = useState<"idle" | "empty" | "pending" | "waiting" | "saving" | "saved" | "local-only">(recovery.source === "default" ? "empty" : recovery.snapshot.version > 0 ? "saved" : "idle");
  const versionRef = useRef(recovery.snapshot.version);
  const serverVersionRef = useRef(recovery.serverVersion);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const collaborationHydratedRef = useRef(false);
  const startedProviderRef = useRef<HocuspocusProvider | null>(null);
  const unsavedDraftRef = useRef(recovery.source === "default");
  const titleRef = useRef(initialTitle);
  const initialFingerprint = documentContentFingerprint(recovery.snapshot);
  const localFingerprintRef = useRef(initialFingerprint);
  const serverFingerprintRef = useRef<string | null>(recovery.source === "postgres" ? initialFingerprint : null);
  const provider = useMemo(() => {
    if (!collaborationUrl) return null;
    const providerConfiguration = {
      url: collaborationUrl,
      name: documentId,
      document: new Y.Doc(),
      token: "demo-editor",
      autoConnect: false,
    };
    return new HocuspocusProvider(providerConfiguration);
  }, [collaborationUrl, documentId]);
  const pendingProviderDestroyRef = useRef<{ provider: HocuspocusProvider; timer: number } | null>(null);
  const editor = useCreateBlockNote({
    schema: seekSchema,
    extensions: [syntaxHighlighter],
    dictionary: { ...zh, math: mathLocales.zh },
    ...(provider
      ? { collaboration: { provider, fragment: provider.document.getXmlFragment("document-store"), user: { name: "你", color: "#0f766e" } } }
      : { initialContent: recovery.snapshot.blocks as never }),
  }, [provider]);

  const save = useCallback(() => {
    if (provider && !collaborationHydratedRef.current) {
      pendingSaveRef.current = true;
      setSaveStatus("waiting");
      return;
    }
    pendingSaveRef.current = true;
    if (savingRef.current) return;
    savingRef.current = true;

    void (async () => {
      while (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        const projection = projectBlocks(editor.document);
        if (unsavedDraftRef.current && isEmptyProjection(projection)) {
          setSaveStatus("empty");
          continue;
        }
        const fingerprint = documentContentFingerprint({ blocks: editor.document, ...projection });
        const localChanged = fingerprint !== localFingerprintRef.current;
        const serverChanged = fingerprint !== serverFingerprintRef.current;
        if (!localChanged && !serverChanged) {
          setSaveStatus("saved");
          continue;
        }

        const optimisticVersion = Math.max(versionRef.current, serverVersionRef.current) + 1;
        const localSnapshot: DocumentSnapshot = {
          blocks: editor.document,
          ...projection,
          version: optimisticVersion,
          savedAt: new Date().toISOString(),
        };

        window.localStorage.setItem(cacheKey(documentId), JSON.stringify(localSnapshot));
        localFingerprintRef.current = fingerprint;
        versionRef.current = optimisticVersion;
        setVersion(optimisticVersion);
        setSavedAt(localSnapshot.savedAt);
        setSaveStatus("saving");

        if (!serverChanged) {
          setSaveStatus("saved");
          continue;
        }

        try {
          const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...localSnapshot, title: titleRef.current, project: initialProject, reason: "autosave" }),
            keepalive: true,
          });
          if (!response.ok) throw new Error(`Document save failed: ${response.status}`);
          const result = await response.json() as { version: number; updatedAt: string; changed: boolean; created: boolean };
          const persistedSnapshot = { ...localSnapshot, version: result.version, savedAt: result.updatedAt };
          window.localStorage.setItem(cacheKey(documentId), JSON.stringify(persistedSnapshot));
          serverVersionRef.current = result.version;
          serverFingerprintRef.current = fingerprint;
          versionRef.current = result.version;
          setVersion(result.version);
          setSavedAt(result.updatedAt);
          setSaveStatus("saved");
          if (result.created) {
            unsavedDraftRef.current = false;
            window.dispatchEvent(new Event("seek:documents-changed"));
          }
        } catch (error) {
          console.warn("PostgreSQL save failed; the local recovery copy is retained.", error);
          setSaveStatus("local-only");
          break;
        }
      }
      savingRef.current = false;
    })();
  }, [documentId, editor, initialProject, provider]);

  useEffect(() => {
    const onDraftTitleChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ documentId: string; title: string }>).detail;
      if (detail?.documentId === documentId) titleRef.current = detail.title;
    };
    window.addEventListener("seek:draft-title-changed", onDraftTitleChanged);
    return () => window.removeEventListener("seek:draft-title-changed", onDraftTitleChanged);
  }, [documentId]);

  useEffect(() => {
    if (!provider) {
      collaborationHydratedRef.current = true;
      if (pendingSaveRef.current) queueMicrotask(save);
      return;
    }

    let authenticationFailed = false;
    const slowConnectionTimer = window.setTimeout(() => {
      if (collaborationHydratedRef.current || authenticationFailed) return;
      setCollaborationStatus("retrying");
    }, 5_000);
    const onStatus = ({ status }: { status: string }) => {
      if (authenticationFailed) return;
      if (status === "connected") {
        setCollaborationStatus(provider.synced ? "connected" : "syncing");
      } else if (status === "disconnected") {
        setCollaborationStatus("retrying");
      } else {
        setCollaborationStatus("connecting");
      }
    };
    const onDisconnect = ({ event }: { event: CloseEvent }) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("Collaboration connection closed.", {
          url: collaborationUrl,
          code: event.code,
          reason: event.reason || "No close reason provided",
        });
      }
      setCollaborationStatus(authenticationFailed ? "failed" : "retrying");
    };
    const onAuthenticationFailed = () => {
      authenticationFailed = true;
      setCollaborationStatus("failed");
    };
    const onSynced = ({ state }: { state: boolean }) => {
      if (!state || collaborationHydratedRef.current) return;
      const fragment = provider.document.getXmlFragment("document-store");
      collaborationHydratedRef.current = true;
      if (fragment.length === 0 || recovery.shouldRestoreToCollaboration) {
        editor.replaceBlocks(editor.document, recovery.snapshot.blocks as never);
      }
      setCollaborationStatus("connected");
    };

    provider.on("status", onStatus);
    provider.on("disconnect", onDisconnect);
    provider.on("authenticationFailed", onAuthenticationFailed);
    provider.on("synced", onSynced);
    if (provider.synced) onSynced({ state: true });
    if (startedProviderRef.current !== provider) {
      startedProviderRef.current = provider;
      void provider.connect();
    }

    return () => {
      window.clearTimeout(slowConnectionTimer);
      provider.off("status", onStatus);
      provider.off("disconnect", onDisconnect);
      provider.off("authenticationFailed", onAuthenticationFailed);
      provider.off("synced", onSynced);
    };
  }, [collaborationUrl, editor, provider, recovery, save]);

  useEffect(() => {
    const pendingDestroy = pendingProviderDestroyRef.current;
    if (pendingDestroy) {
      window.clearTimeout(pendingDestroy.timer);
      if (pendingDestroy.provider !== provider) pendingDestroy.provider.destroy();
      pendingProviderDestroyRef.current = null;
    }

    return () => {
      if (!provider) return;
      const timer = window.setTimeout(() => {
        provider.destroy();
        if (pendingProviderDestroyRef.current?.provider === provider) {
          pendingProviderDestroyRef.current = null;
        }
      }, 0);
      pendingProviderDestroyRef.current = { provider, timer };
    };
  }, [provider]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      if (!collaborationHydratedRef.current) return;
      if (timer) clearTimeout(timer);
      const projection = projectBlocks(editor.document);
      setSaveStatus(unsavedDraftRef.current && isEmptyProjection(projection) ? "empty" : "pending");
      timer = setTimeout(save, 5000);
    };
    const unsubscribe = editor.onChange(onChange);
    const onOnline = () => setOnline(navigator.onLine);
    const onPageHide = () => save();
    const onKeyDown = (event: KeyboardEvent) => {
      if (!editor.domElement?.contains(event.target as Node)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopPropagation();
        save();
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") return;
      const currentBlock = editor.getTextCursorPosition().block;
      if (currentBlock.type !== "paragraph") return;

      const text = blockText(currentBlock.content).trim();
      const codeFence = text.match(/^```([\w#+.-]*)$/);
      if (text !== "$$" && !codeFence) return;

      event.preventDefault();
      event.stopPropagation();
      const replacement = text === "$$"
        ? { type: "mathBlock" as const, content: "" }
        : {
            type: "codeBlock" as const,
            props: { language: codeFence?.[1] || "text" },
            content: "",
          };
      const { insertedBlocks } = editor.replaceBlocks([currentBlock], [replacement]);
      if (insertedBlocks[0]) editor.setTextCursorPosition(insertedBlocks[0], "start");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [editor, save]);

  const collaborationLabel = !online
    ? "网络离线，等待重连"
    : collaborationStatus === "connected"
      ? "协作已连接"
      : collaborationStatus === "syncing"
        ? "正在同步文档"
        : collaborationStatus === "retrying"
          ? "协作连接失败，正在重试"
          : collaborationStatus === "failed"
            ? "协作认证失败"
            : collaborationStatus === "connecting"
              ? "协作连接中"
              : "本地编辑模式";
  const savedTime = formatSavedTime(savedAt);
  const saveLabel = saveStatus === "saved"
    ? `已保存${savedTime ? ` ${savedTime}` : ""}`
    : saveStatus === "empty"
      ? "空文档不会保存"
    : saveStatus === "pending"
      ? "等待保存"
    : saveStatus === "local-only"
      ? "已保存到本机，数据库待同步"
      : saveStatus === "waiting"
        ? "等待协作同步后保存"
      : saveStatus === "saving"
        ? "正在保存"
        : savedAt
          ? "已恢复"
          : "等待编辑";

  return <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
      <span className="flex items-center gap-2">{online && collaborationStatus === "connected" ? <Wifi size={14} className="text-emerald-600" /> : <CloudOff size={14} className="text-amber-600" />} {collaborationLabel}</span>
      <span className="flex items-center gap-3"><span className="flex items-center gap-1">{saveStatus === "saved" ? <Check size={14} className="text-emerald-600" /> : <History size={14} />} {saveLabel}</span><span>v{version}</span></span>
    </div>
    <div className="seek-editor min-h-[620px] px-3 py-5 sm:px-12">
      <BlockNoteView editor={editor} slashMenu={false} editable={collaborationStatus === "local" || collaborationStatus === "connected"}>
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => filterSuggestionItems(
            combineByGroup(getDefaultReactSlashMenuItems(editor), getMathSlashMenuItems(editor)),
            query,
          )}
        />
      </BlockNoteView>
    </div>
  </div>;
}
