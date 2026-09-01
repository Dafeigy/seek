"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Check, History, Menu, MoreHorizontal, PanelLeftClose, Pencil, Share2, X } from "lucide-react";

import { SidebarContent } from "@/components/knowledge-dashboard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  documentId: string;
  title: string;
  project?: string;
  children: ReactNode;
};

export function DocumentWorkspace({ documentId, title: initialTitle, project: initialProject = "平台基础设施", children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [project, setProject] = useState(initialProject);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(initialTitle);
  const [titleStatus, setTitleStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const loadMetadata = useCallback(() => {
    const controller = new AbortController();
    void fetch(`/api/documents/${encodeURIComponent(documentId)}`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ title: string; project: string }> : null)
      .then((document) => {
        if (!document) return;
        setTitle(document.title);
        setDraftTitle(document.title);
        setProject(document.project);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.warn("Document metadata load failed.", error);
      });
    return controller;
  }, [documentId]);

  useEffect(() => {
    let controller = loadMetadata();
    const refresh = () => { controller.abort(); controller = loadMetadata(); };
    window.addEventListener("seek:documents-changed", refresh);
    return () => { controller.abort(); window.removeEventListener("seek:documents-changed", refresh); };
  }, [loadMetadata]);

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
    {mobileOpen && <button className="fixed inset-0 z-40 cursor-default bg-black/20 backdrop-blur-[2px] md:hidden" onClick={() => setMobileOpen(false)} aria-label="关闭侧边栏" />}

    <aside className={cn("fixed inset-y-0 left-0 z-50 w-[276px] border-r border-black/[.06] bg-sidebar transition-transform duration-200 md:hidden", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
      <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 flex size-10 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-black/[.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29C16A]/40" aria-label="关闭侧边栏"><X className="size-4" /></button>
      <SidebarContent compact={false} closeMobile={() => setMobileOpen(false)} currentPage="document" />
    </aside>

    <aside id="document-sidebar" aria-hidden={!sidebarOpen} inert={!sidebarOpen} className={cn("fixed inset-y-0 left-0 z-30 hidden w-[252px] border-r border-black/[.06] bg-sidebar transition-transform duration-200 md:block", sidebarOpen ? "translate-x-0" : "-translate-x-full")}>
      <SidebarContent compact={false} currentPage="document" />
    </aside>

    <section className={cn("min-h-screen transition-[padding] duration-200", sidebarOpen && "md:pl-[252px]")}>
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-black/[.06] bg-canvas/90 px-3 backdrop-blur-xl sm:px-5">
        <Button variant="ghost" size="icon" className="mr-1 md:hidden" onClick={() => setMobileOpen(true)} aria-label="打开侧边栏"><Menu className="size-[18px]" /></Button>
        <Button variant="ghost" size="icon" className="mr-1 hidden md:inline-flex" onClick={() => setSidebarOpen((value) => !value)} aria-expanded={sidebarOpen} aria-controls="document-sidebar" aria-label={sidebarOpen ? "收起侧边栏" : "展开侧边栏"} title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}>
          <PanelLeftClose className={cn("size-[18px] transition-transform duration-200", !sidebarOpen && "rotate-180")} />
        </Button>
        <div className="mx-2 h-4 w-px bg-black/10" />
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="hidden text-soft sm:inline">{project}</span>
          <span className="hidden text-soft sm:inline">/</span>
          <span className="truncate font-medium">{title}</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex"><History className="size-4" />版本历史</Button>
          <Button variant="ghost" size="icon" aria-label="分享文档"><Share2 className="size-[17px]" /></Button>
          <Button variant="ghost" size="icon" aria-label="更多操作"><MoreHorizontal className="size-[17px]" /></Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1"><p className="text-sm text-muted">最后编辑：你 · 自动保存</p>
            {editingTitle ? <input
              autoFocus
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") { setDraftTitle(title); setEditingTitle(false); }
              }}
              aria-label="文档标题"
              className="mt-1 w-full rounded-lg border border-[#29C16A]/40 bg-white px-2 py-1 text-2xl font-semibold tracking-tight outline-none ring-2 ring-[#29C16A]/10"
            /> : <button type="button" onClick={() => setEditingTitle(true)} className="group mt-1 flex max-w-full cursor-text items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29C16A]/40" title="点击重命名">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1><Pencil className="size-4 shrink-0 text-soft opacity-0 transition-opacity group-hover:opacity-100" />
            </button>}
            {titleStatus !== "idle" && <p role="status" className={cn("mt-1 text-xs", titleStatus === "error" ? "text-red-600" : "text-soft")}>{titleStatus === "saving" ? "正在保存标题…" : titleStatus === "saved" ? <span className="inline-flex items-center gap-1"><Check className="size-3" />标题已保存</span> : "标题保存失败，请重试"}</p>}
          </div>
          <div className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Editor</div>
        </div>
        {children}
      </section>
    </section>
  </main>;
}
