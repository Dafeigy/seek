"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { History, Menu, MoreHorizontal, PanelLeftClose, Share2, X } from "lucide-react";

import { SidebarContent } from "@/components/knowledge-dashboard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  project?: string;
  children: ReactNode;
};

export function DocumentWorkspace({ title, project = "平台基础设施", children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

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
          <div className="min-w-0"><p className="text-sm text-muted">最后编辑：你 · 自动保存</p><h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{title}</h1></div>
          <div className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Editor</div>
        </div>
        {children}
      </section>
    </section>
  </main>;
}
