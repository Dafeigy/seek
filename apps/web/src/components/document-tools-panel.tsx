"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileUp, History, MessageSquare, Paperclip, RefreshCw, Send, Trash2, X } from "lucide-react";
import { nanoid } from "nanoid";

import { Button } from "@/components/ui/button";

export type DocumentTool = "history" | "comments" | "attachments";

type Version = { version: number; note: string; publishedAt: string; publisher: { displayName: string } | null };
type Comment = { id: string; content: string; createdAt: string; author: { displayName: string } };
type Thread = { id: string; anchor: { blockId: string; selectedText: string }; status: "open" | "resolved"; comments: Comment[] };
type Attachment = { id: string; fileName: string; mimeType: string; byteSize: number; createdAt: string; deletedAt: string | null; uploaderName: string; url: string };
export type CommentAnchor = { blockId: string; selectedText: string; from?: number; to?: number; relativeFrom?: string | null; relativeTo?: string | null; contextBefore?: string; contextAfter?: string };

function dateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function DocumentToolsPanel({ documentId, tool, onClose, canPublish, canRestore, canComment, canUpdate, initialCommentAnchor }: {
  documentId: string;
  tool: DocumentTool;
  onClose: () => void;
  canPublish: boolean;
  canRestore: boolean;
  canComment: boolean;
  canUpdate: boolean;
  initialCommentAnchor?: CommentAnchor | null;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [anchor, setAnchor] = useState<CommentAnchor | null>(initialCommentAnchor ?? null);
  const [content, setContent] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const commandTimeout = useRef<number | null>(null);

  const loadVersions = useCallback(async () => {
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/versions`);
    if (response.ok) setVersions(((await response.json()) as { versions: Version[] }).versions);
  }, [documentId]);
  const loadComments = useCallback(async () => {
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/comments`);
    if (response.ok) setThreads(((await response.json()) as { threads: Thread[] }).threads);
  }, [documentId]);
  const loadAttachments = useCallback(async () => {
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/attachments${canRestore ? "?includeDeleted=1" : ""}`);
    if (response.ok) setAttachments(((await response.json()) as { attachments: Attachment[] }).attachments);
  }, [canRestore, documentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (tool === "history") void loadVersions();
      if (tool === "comments") void loadComments();
      if (tool === "attachments") void loadAttachments();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAttachments, loadComments, loadVersions, tool]);

  useEffect(() => {
    const onAnchor = (event: Event) => {
      const detail = (event as CustomEvent<CommentAnchor & { documentId: string }>).detail;
      if (detail?.documentId === documentId) setAnchor(detail);
    };
    const onAttachmentsChanged = () => void loadAttachments();
    window.addEventListener("seek:comment-anchor", onAnchor);
    window.addEventListener("seek:attachments-changed", onAttachmentsChanged);
    return () => {
      window.removeEventListener("seek:comment-anchor", onAnchor);
      window.removeEventListener("seek:attachments-changed", onAttachmentsChanged);
    };
  }, [documentId, loadAttachments]);

  useEffect(() => {
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<{ documentId: string; requestId: string; ok: boolean; error?: string; version?: number; restoredFrom?: number }>).detail;
      if (detail?.documentId !== documentId) return;
      if (commandTimeout.current !== null) window.clearTimeout(commandTimeout.current);
      commandTimeout.current = null;
      setBusy(false);
      if (!detail.ok) return setStatus(detail.error ?? "操作失败");
      if (detail.version) {
        setNote("");
        setStatus(`版本 v${detail.version} 已发布`);
        void loadVersions();
      } else if (detail.restoredFrom) {
        setStatus(`已将 v${detail.restoredFrom} 恢复为当前草稿，尚未发布`);
      }
    };
    window.addEventListener("seek:document-command-result", onResult);
    return () => window.removeEventListener("seek:document-command-result", onResult);
  }, [documentId, loadVersions]);

  function command(type: "document.publish" | "document.restore", extra: { note?: string; version?: number } = {}) {
    setBusy(true);
    setStatus("");
    const requestId = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : nanoid();
    if (commandTimeout.current !== null) window.clearTimeout(commandTimeout.current);
    commandTimeout.current = window.setTimeout(() => {
      commandTimeout.current = null;
      setBusy(false);
      setStatus("协作连接未响应，请确认连接恢复后重试");
    }, 10_000);
    window.dispatchEvent(new CustomEvent("seek:document-command", { detail: {
      documentId, type, requestId, ...extra,
    } }));
  }

  useEffect(() => () => {
    if (commandTimeout.current !== null) window.clearTimeout(commandTimeout.current);
  }, []);

  async function createComment() {
    if (!anchor || !content.trim()) return;
    setBusy(true);
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/comments`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, ...anchor }),
    });
    setBusy(false);
    if (!response.ok) return setStatus(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "评论失败");
    setContent("");
    setStatus("评论已添加");
    await loadComments();
  }

  async function changeThreadStatus(thread: Thread) {
    await fetch(`/api/documents/${encodeURIComponent(documentId)}/comments/${encodeURIComponent(thread.id)}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: thread.status === "open" ? "resolved" : "open" }),
    });
    await loadComments();
  }

  async function reply(threadId: string) {
    const replyContent = replies[threadId]?.trim();
    if (!replyContent) return;
    setBusy(true);
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/comments/${encodeURIComponent(threadId)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: replyContent }),
    });
    setBusy(false);
    if (!response.ok) return setStatus(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "回复失败");
    setReplies((current) => ({ ...current, [threadId]: "" }));
    await loadComments();
  }

  async function upload(file: File) {
    setBusy(true);
    const form = new FormData();
    form.set("file", file);
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/attachments`, { method: "POST", body: form });
    setBusy(false);
    if (!response.ok) return setStatus(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "上传失败");
    setStatus("附件已上传");
    await loadAttachments();
  }

  async function deleteAttachment(attachmentId: string) {
    setBusy(true);
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) return setStatus(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "删除失败");
    setStatus("附件已移入 30 天恢复期");
    await loadAttachments();
  }

  async function restoreAttachment(attachmentId: string) {
    setBusy(true);
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/attachments/${encodeURIComponent(attachmentId)}`, { method: "PATCH" });
    setBusy(false);
    if (!response.ok) return setStatus(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "恢复失败");
    setStatus("附件已恢复");
    await loadAttachments();
  }

  const titles = { history: "版本历史", comments: "评论", attachments: "附件" };
  return <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[390px] flex-col border-l border-border bg-card shadow-2xl">
    <header className="flex h-14 items-center border-b border-border px-4">
      <h2 className="font-semibold">{titles[tool]}</h2>
      <Button className="ml-auto" variant="ghost" size="icon" onClick={onClose} aria-label="关闭面板"><X className="size-4" /></Button>
    </header>
    <div className="flex-1 overflow-y-auto p-4">
      {status && <p role="status" className="mb-3 rounded-lg bg-muted px-3 py-2 text-sm">{status}</p>}

      {tool === "history" && <div className="space-y-4">
        {canPublish && <div className="rounded-xl border border-border p-3">
          <label className="text-sm font-medium" htmlFor="publish-note">发布当前实时草稿</label>
          <textarea id="publish-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="发布说明（可选）" className="mt-2 min-h-20 w-full resize-none rounded-lg border border-border bg-canvas p-2 text-sm outline-none focus:border-brand" />
          <Button className="mt-2 w-full" disabled={busy} onClick={() => command("document.publish", { note })}>发布新版本</Button>
        </div>}
        {versions.length === 0 ? <p className="py-10 text-center text-sm text-muted">尚未发布任何版本</p> : versions.map((version) => <article key={version.version} className="rounded-xl border border-border p-3">
          <div className="flex items-center gap-2"><History className="size-4" /><strong>v{version.version}</strong><span className="ml-auto text-xs text-muted">{dateTime(version.publishedAt)}</span></div>
          <p className="mt-1 text-xs text-muted">{version.publisher?.displayName ?? "历史发布者"}</p>
          {version.note && <p className="mt-2 text-sm">{version.note}</p>}
          {canRestore && <Button variant="outline" size="sm" className="mt-3" disabled={busy} onClick={() => command("document.restore", { version: version.version })}><RefreshCw className="size-3.5" />恢复为草稿</Button>}
        </article>)}
      </div>}

      {tool === "comments" && <div className="space-y-4">
        {canComment && <div className="rounded-xl border border-border p-3">
          <p className="text-sm font-medium">新评论</p>
          <p className="mt-1 truncate text-xs text-muted">{anchor ? (anchor.selectedText ? `选区：“${anchor.selectedText}”` : `区块 ${anchor.blockId}`) : "请先在文档中放置光标或选中文字"}</p>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="写下评论…" className="mt-2 min-h-20 w-full resize-none rounded-lg border border-border bg-canvas p-2 text-sm outline-none focus:border-brand" />
          <Button size="sm" disabled={busy || !anchor || !content.trim()} onClick={() => void createComment()}><Send className="size-3.5" />评论</Button>
        </div>}
        {threads.length === 0 ? <p className="py-10 text-center text-sm text-muted">暂无评论</p> : threads.map((thread) => <article key={thread.id} className="rounded-xl border border-border p-3">
          <div className="flex items-center gap-2 text-xs text-muted"><MessageSquare className="size-3.5" /><span className="truncate">{thread.anchor.selectedText || `区块 ${thread.anchor.blockId}`}</span></div>
          {thread.comments.map((comment) => <div key={comment.id} className="mt-3 border-l-2 border-border pl-3"><div className="text-xs text-muted">{comment.author.displayName} · {dateTime(comment.createdAt)}</div><p className="mt-1 whitespace-pre-wrap text-sm">{comment.content}</p></div>)}
          {canComment && <div className="mt-3 flex gap-2"><input value={replies[thread.id] ?? ""} onChange={(event) => setReplies((current) => ({ ...current, [thread.id]: event.target.value }))} placeholder="回复线程…" className="min-w-0 flex-1 rounded-lg border border-border bg-canvas px-2 text-sm outline-none focus:border-brand" /><Button size="sm" disabled={busy || !replies[thread.id]?.trim()} onClick={() => void reply(thread.id)}>回复</Button></div>}
          {canComment && <Button variant="ghost" size="sm" className="mt-2" onClick={() => void changeThreadStatus(thread)}><CheckCircle2 className="size-3.5" />{thread.status === "open" ? "解决" : "重新打开"}</Button>}
        </article>)}
      </div>}

      {tool === "attachments" && <div className="space-y-3">
        {canUpdate && <><input ref={fileInput} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /><Button className="w-full" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}><FileUp className="size-4" />上传附件（最大 20MB）</Button></>}
        {attachments.length === 0 ? <p className="py-10 text-center text-sm text-muted">暂无附件；图片也可直接粘贴到编辑器</p> : attachments.map((attachment) => <div key={attachment.id} className="flex items-center rounded-xl border border-border hover:bg-muted/50">
          {attachment.deletedAt ? <div className="flex min-w-0 flex-1 items-center gap-3 p-3 opacity-60"><Trash2 className="size-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{attachment.fileName}</span><span className="text-xs text-muted">恢复期内 · 删除于 {dateTime(attachment.deletedAt)}</span></span></div> : <a href={attachment.url} className="flex min-w-0 flex-1 items-center gap-3 p-3"><Paperclip className="size-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{attachment.fileName}</span><span className="text-xs text-muted">{(attachment.byteSize / 1024).toFixed(1)} KB · {attachment.uploaderName}</span></span><Download className="size-4" /></a>}
          {attachment.deletedAt && canRestore ? <Button variant="ghost" size="sm" className="mr-1 shrink-0" disabled={busy} onClick={() => void restoreAttachment(attachment.id)}><RefreshCw className="size-3.5" />恢复</Button> : canUpdate && <Button variant="ghost" size="icon" className="mr-1 shrink-0" disabled={busy} onClick={() => void deleteAttachment(attachment.id)} aria-label={`删除附件 ${attachment.fileName}`}><Trash2 className="size-4" /></Button>}
        </div>)}
      </div>}
    </div>
  </aside>;
}
