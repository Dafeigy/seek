"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Check, History, Menu, MessageSquare, PanelLeftClose, Paperclip, Pencil, Upload, X } from "lucide-react";

import { DocumentToolsPanel, type CommentAnchor, type DocumentTool } from "@/components/document-tools-panel";
import { SidebarContent } from "@/components/knowledge-dashboard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSidebarCompact } from "@/components/sidebar-state";

type Props = {
  documentId: string;
  title: string;
  project?: string;
  canUpdate?: boolean;
  canPublish?: boolean;
  canRestore?: boolean;
  canComment?: boolean;
  children: ReactNode;
};

export function DocumentWorkspace({ documentId, title: initialTitle, project: initialProject = "平台基础设施", canUpdate = false, canPublish = false, canRestore = false, canComment = false, children }: Props) {
  const [compact, setCompact] = useSidebarCompact();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [project] = useState(initialProject);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(initialTitle);
  const [titleStatus, setTitleStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [collaboration, setCollaboration] = useState({ label: "协作连接中", connected: false });
  const [participants, setParticipants] = useState<Array<{ id: string; displayName: string; color: string; isCurrentUser: boolean }>>([]);
  const [activeTool, setActiveTool] = useState<DocumentTool | null>(null);
  const [commentAnchor, setCommentAnchor] = useState<CommentAnchor | null>(null);

  useEffect(() => {
    const onCollaborationStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ documentId: string; label: string; connected: boolean }>).detail;
      if (detail?.documentId === documentId) setCollaboration({ label: detail.label, connected: detail.connected });
    };
    window.addEventListener("seek:collaboration-status", onCollaborationStatus);
    const onParticipants = (event: Event) => {
      const detail = (event as CustomEvent<{ documentId: string; participants: Array<{ id: string; displayName: string; color: string; isCurrentUser: boolean }> }>).detail;
      if (detail?.documentId === documentId) setParticipants(detail.participants);
    };
    window.addEventListener("seek:collaboration-participants", onParticipants);
    const onCommentAnchor = (event: Event) => {
      const detail = (event as CustomEvent<CommentAnchor & { documentId: string }>).detail;
      if (detail?.documentId === documentId) setCommentAnchor(detail);
    };
    window.addEventListener("seek:comment-anchor", onCommentAnchor);
    return () => {
      window.removeEventListener("seek:collaboration-status", onCollaborationStatus);
      window.removeEventListener("seek:collaboration-participants", onParticipants);
      window.removeEventListener("seek:comment-anchor", onCommentAnchor);
    };
  }, [documentId]);

  async function commitTitle() {
    const nextTitle = draftTitle.trim() || "未命名文档";
    setEditingTitle(false);
    if (nextTitle === title) return;
    setTitleStatus("saving");
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      if (response.status === 404) {
        setTitle(nextTitle);
        setDraftTitle(nextTitle);
        setTitleStatus("idle");
        window.dispatchEvent(new CustomEvent("seek:draft-title-changed", { detail: { documentId, title: nextTitle } }));
        return;
      }
      if (!response.ok) throw new Error(`Rename failed: ${response.status}`);
      const document = await response.json() as { title: string };
      setTitle(document.title);
      setDraftTitle(document.title);
      setTitleStatus("saved");
      window.dispatchEvent(new Event("seek:documents-changed"));
      window.setTimeout(() => setTitleStatus("idle"), 1600);
    } catch (error) {
      console.warn("Document rename failed.", error);
      setDraftTitle(title);
      setTitleStatus("error");
    }
  }

  return <main className="min-h-screen bg-canvas text-ink">
    {mobileOpen && <Button type="button" variant="ghost" className="fixed inset-0 z-40 h-auto w-auto cursor-default rounded-none bg-black/20 p-0 backdrop-blur-[2px] hover:bg-black/20 md:hidden" onClick={() => setMobileOpen(false)} aria-label="关闭侧边栏" />}

    <aside className={cn("fixed inset-y-0 left-0 z-50 w-[331.2px] border-r border-border bg-sidebar transition-transform duration-200 md:hidden", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
      <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 size-10 text-muted" aria-label="关闭侧边栏"><X className="size-4" /></Button>
      <SidebarContent compact={false} closeMobile={() => setMobileOpen(false)} currentPage="home" />
    </aside>

    <aside id="document-sidebar" className={cn("fixed inset-y-0 left-0 z-30 hidden border-r border-border bg-sidebar transition-[width] duration-200 md:block", compact ? "w-[68px]" : "w-[302.4px]")}>
      <SidebarContent compact={compact} currentPage="home" />
    </aside>

    <section className={cn("min-h-screen transition-[padding] duration-200", compact ? "md:pl-[68px]" : "md:pl-[302.4px]")}>
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-border bg-canvas/90 px-3 backdrop-blur-xl sm:px-5">
        <Button variant="ghost" size="icon" className="mr-1 md:hidden" onClick={() => setMobileOpen(true)} aria-label="打开侧边栏"><Menu className="size-[18px]" /></Button>
        <Button variant="ghost" size="icon" className="mr-1 hidden md:inline-flex" onClick={() => setCompact((value) => !value)} aria-expanded={!compact} aria-controls="document-sidebar" aria-label={compact ? "展开侧边栏" : "收起侧边栏"} title={compact ? "展开侧边栏" : "收起侧边栏"}>
          <PanelLeftClose className={cn("size-[18px] transition-transform duration-200", compact && "rotate-180")} />
        </Button>
        <div className="mx-2 h-4 w-px bg-border" />
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="hidden text-soft sm:inline">{project}</span>
          <span className="hidden text-soft sm:inline">/</span>
          <span className="truncate font-medium">{title}</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {canPublish && <Button variant="default" size="sm" className="hidden sm:inline-flex" onClick={() => setActiveTool("history")}><Upload className="size-4" />发布</Button>}
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => setActiveTool("history")}><History className="size-4" />版本历史</Button>
          <Button variant="ghost" size="icon" onClick={() => setActiveTool("comments")} aria-label="评论"><MessageSquare className="size-[17px]" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setActiveTool("attachments")} aria-label="附件"><Paperclip className="size-[17px]" /></Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1"><p className="text-sm text-muted">最后编辑：你 · 自动保存</p>
            {editingTitle && canUpdate ? <input
              autoFocus
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") { setDraftTitle(title); setEditingTitle(false); }
              }}
              aria-label="文档标题"
              className="mt-1 w-full rounded-lg border border-brand/40 bg-card px-2 py-1 text-2xl font-semibold tracking-tight outline-none ring-2 ring-brand/10"
            /> : <Button type="button" variant="ghost" disabled={!canUpdate} onClick={() => setEditingTitle(true)} className="group mt-1 h-auto max-w-full justify-start p-0 text-left hover:bg-transparent disabled:opacity-100" title={canUpdate ? "点击重命名" : "只读文档"}>
              <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1><Pencil className="size-4 shrink-0 text-soft opacity-0 transition-opacity group-hover:opacity-100" />
            </Button>}
            {titleStatus !== "idle" && <p role="status" className={cn("mt-1 text-xs", titleStatus === "error" ? "text-destructive" : "text-soft")}>{titleStatus === "saving" ? "正在保存标题…" : titleStatus === "saved" ? <span className="inline-flex items-center gap-1"><Check className="size-3" />标题已保存</span> : "标题保存失败，请重试"}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <div className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", collaboration.connected ? "bg-success-soft text-success-foreground" : "bg-muted text-muted-foreground")} title={canUpdate ? "Editor" : "Viewer"}>
              <span className={cn("size-1.5 rounded-full", collaboration.connected ? "bg-success-foreground" : "bg-muted-foreground")} />
              {collaboration.label}
            </div>
            {collaboration.connected && participants.length > 0 && <div className="flex items-center -space-x-1.5" aria-label={`当前有 ${participants.length} 人正在浏览`}>
              {participants.slice(0, 6).map((participant) => <span key={participant.id} title={`${participant.displayName}${participant.isCurrentUser ? "（你）" : ""}`} className="flex size-6 items-center justify-center rounded-full border-2 border-canvas text-[10px] font-semibold text-white" style={{ backgroundColor: participant.color }}>{participant.displayName.trim().slice(0, 1).toUpperCase() || "?"}</span>)}
              {participants.length > 6 && <span className="flex size-6 items-center justify-center rounded-full border-2 border-canvas bg-muted text-[9px] font-medium text-muted-foreground">+{participants.length - 6}</span>}
            </div>}
          </div>
        </div>
        {children}
      </section>
    </section>
    {activeTool && <DocumentToolsPanel documentId={documentId} tool={activeTool} onClose={() => setActiveTool(null)} canPublish={canPublish} canRestore={canRestore} canComment={canComment} canUpdate={canUpdate} initialCommentAnchor={commentAnchor} />}
  </main>;
}
