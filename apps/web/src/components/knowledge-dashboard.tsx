"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bell, ChevronRight, ChevronsUpDown, Clock3, FileText, Folder,
  FolderLock, HelpCircle, Home, Inbox, Menu, MessageCircle, Mic2,
  PanelLeftClose, Plus, Search, Settings2, SquarePen, Trash2, Waves, X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SeekCompanion } from "@/components/seek-companion";

const teamProjects = [
  {
    title: "平台基础设施",
    documents: [
      { title: "模型部署规范", href: "/documents/model-deployment" },
      { title: "服务监控与告警", href: "/documents/new" },
      { title: "发布流程检查单", href: "/documents/new" },
    ],
  },
  {
    title: "算法研究",
    documents: [
      { title: "实验记录模板", href: "/documents/new" },
      { title: "模型评测周报", href: "/documents/new" },
    ],
  },
  {
    title: "客户端",
    documents: [
      { title: "Web 端交互规范", href: "/documents/new" },
      { title: "移动端设计系统", href: "/documents/new" },
    ],
  },
];

const privateProjects = [
  {
    title: "个人工作台",
    documents: [
      { title: "本周计划", href: "/documents/new" },
      { title: "灵感与备忘", href: "/documents/new" },
    ],
  },
];

const documents = [
  { title: "模型部署规范", project: "平台基础设施", updated: "刚刚", author: "林墨", href: "/documents/model-deployment", initials: "林" },
  { title: "服务监控与告警", project: "平台基础设施", updated: "昨天", author: "陈一", href: "/documents/new", initials: "陈" },
  { title: "实验记录模板", project: "算法研究", updated: "3 天前", author: "你", href: "/documents/new", initials: "你" },
  { title: "Web 端交互规范", project: "客户端", updated: "5 天前", author: "周语", href: "/documents/new", initials: "周" },
];

function greetingForNow() {
  const hour = new Date().getHours();
  return hour >= 5 && hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
}

export function SidebarContent({ compact, closeMobile, currentPage = "home" }: { compact: boolean; closeMobile?: () => void; currentPage?: "home" | "document" }) {
  const [expandedProjects, setExpandedProjects] = useState(() => new Set(["平台基础设施", "个人工作台"]));

  function toggleProject(title: string) {
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  const renderProjectSection = (label: string, projects: typeof teamProjects, isPrivate = false) => <section aria-labelledby={`sidebar-${label}`}>
    <div className="mb-1 mt-5 flex h-8 items-center justify-between px-3 text-[11px] font-medium text-soft">
      <span id={`sidebar-${label}`}>{label}</span>
      <button className="flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-black/[.045] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29C16A]/40" aria-label={`新建${label}`}><Plus className="size-3.5" /></button>
    </div>
    <div className="space-y-0.5">{projects.map((project) => {
      const expanded = expandedProjects.has(project.title);
      return <div key={project.title}>
        <button onClick={() => toggleProject(project.title)} aria-expanded={expanded} className="group flex h-9 w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[13px] text-muted transition-colors hover:bg-black/[.04] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29C16A]/40">
          <ChevronRight className={cn("size-3.5 shrink-0 text-soft transition-transform duration-200", expanded && "rotate-90")} />
          {isPrivate ? <FolderLock className="size-3.5 shrink-0 text-soft group-hover:text-[#159B4E]" /> : <Folder className="size-3.5 shrink-0 text-soft group-hover:text-[#159B4E]" />}
          <span className="min-w-0 flex-1 truncate text-left">{project.title}</span>
          <span className="pr-1 text-[10px] text-soft">{project.documents.length}</span>
        </button>
        {expanded && <div className="ml-[15px] border-l border-black/[.07] pl-2">{project.documents.map((document) => <Link onClick={closeMobile} href={document.href as never} key={`${project.title}-${document.title}`} className="group flex h-8 items-center gap-2 rounded-lg px-2 text-[12px] text-muted transition-colors hover:bg-black/[.04] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29C16A]/40">
          <FileText className="size-3.5 shrink-0 text-soft group-hover:text-[#159B4E]" /><span className="truncate">{document.title}</span>
        </Link>)}</div>}
      </div>;
    })}</div>
  </section>;

  return <div className="flex h-full flex-col">
    <div className={cn("flex h-16 items-center", compact ? "justify-center px-2" : "px-3")}>
      <button className={cn("group flex min-w-0 cursor-pointer items-center rounded-xl p-2 text-left transition-colors hover:bg-black/[.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29C16A]/40", compact ? "justify-center" : "w-full gap-2.5")} aria-label="切换工作区">
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[#152019] text-sm font-semibold text-white shadow-sm">S<span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-[#f5f7f5] bg-[#29C16A]" /></span>
        {!compact && <><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold tracking-tight">Seek Team</span><span className="block text-[11px] text-muted">团队工作区</span></span><ChevronsUpDown className="size-3.5 text-muted" /></>}
      </button>
    </div>

    <div className="scrollbar-none flex-1 overflow-y-auto px-2 pb-3">
      <nav aria-label="快捷导航" className={cn(compact ? "space-y-1" : "flex items-center gap-1 px-1")}>
        {[
          { label: "首页", icon: Home, active: currentPage === "home", href: "/" },
          { label: "对话", icon: MessageCircle },
          { label: "会议", icon: Mic2 },
          { label: "收件箱", icon: Inbox },
          { label: "搜索", icon: Search },
        ].map((item) => {
          const className = cn("group relative flex h-10 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-black/[.04] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29C16A]/40", compact ? "w-full" : item.active ? "min-w-0 flex-1 gap-2 bg-white px-2 text-ink shadow-[0_1px_2px_rgba(15,23,42,.06)] ring-1 ring-black/[.04]" : "w-9 shrink-0");
          const content = <><item.icon className={cn("size-[17px] shrink-0", item.active && "text-[#159B4E]")} />{!compact && item.active && <span className="truncate text-[13px] font-medium">{item.label}</span>}</>;
          return item.href
            ? <Link key={item.label} href={item.href as never} title={item.label} onClick={closeMobile} aria-current={item.active ? "page" : undefined} className={className}>{content}</Link>
            : <button key={item.label} type="button" title={item.label} onClick={closeMobile} className={className}>{content}</button>;
        })}
      </nav>
      {!compact && <>
        <div className="my-4 h-px bg-black/[.055]" />
        <nav aria-label="知识导航"><button onClick={closeMobile} className="group flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-[13px] text-muted transition-colors hover:bg-black/[.04] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29C16A]/40"><Waves className="size-4 text-soft group-hover:text-[#159B4E]" /><span>知识海</span></button></nav>
        {renderProjectSection("项目", teamProjects)}
        {renderProjectSection("私人项目", privateProjects, true)}
      </>}
    </div>
    <div className="border-t border-black/[.055] p-2">
      <button title={compact ? "回收站" : undefined} className={cn("flex h-9 w-full cursor-pointer items-center rounded-lg text-[13px] text-muted transition-colors hover:bg-black/[.04] hover:text-ink", compact ? "justify-center" : "gap-2.5 px-3")}><Trash2 className="size-4" />{!compact && "回收站"}</button>
      <button title={compact ? "设置" : undefined} className={cn("flex h-9 w-full cursor-pointer items-center rounded-lg text-[13px] text-muted transition-colors hover:bg-black/[.04] hover:text-ink", compact ? "justify-center" : "gap-2.5 px-3")}><Settings2 className="size-4" />{!compact && "设置"}</button>
      <button title={compact ? "帮助与反馈" : undefined} className={cn("flex h-9 w-full cursor-pointer items-center rounded-lg text-[13px] text-muted transition-colors hover:bg-black/[.04] hover:text-ink", compact ? "justify-center" : "gap-2.5 px-3")}><HelpCircle className="size-4" />{!compact && "帮助与反馈"}</button>
      <div className={cn("mt-2 flex border-t border-black/[.055] pt-2", compact ? "flex-col gap-1" : "gap-1.5")}>
        <button type="button" title={compact ? "新建会话" : undefined} className={cn("flex h-11 cursor-pointer items-center justify-center rounded-full bg-white text-[12px] font-medium text-ink shadow-[0_1px_2px_rgba(15,23,42,.06)] ring-1 ring-black/[.07] transition-colors hover:bg-[#f9fbf9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29C16A]/40", compact ? "w-11 self-center" : "min-w-0 flex-1 gap-2 px-4")} aria-label="新建会话"><MessageCircle className="size-4 shrink-0 text-[#159B4E]" />{!compact && <span className="truncate">新建会话</span>}</button>
        <Link href={"/documents/new" as never} onClick={closeMobile} title="新建文档" aria-label="新建文档" className="flex size-11 shrink-0 cursor-pointer items-center justify-center self-center rounded-full bg-white text-[#159B4E] shadow-[0_1px_2px_rgba(15,23,42,.06)] ring-1 ring-black/[.07] transition-colors hover:bg-[#f9fbf9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29C16A]/40"><SquarePen className="size-4" /></Link>
      </div>
    </div>
  </div>;
}

export function KnowledgeDashboard() {
  const [compact, setCompact] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [greeting] = useState(greetingForNow);

  return <main className="min-h-screen bg-canvas text-ink">
    {mobileOpen && <button className="fixed inset-0 z-40 cursor-default bg-black/20 backdrop-blur-[2px] md:hidden" onClick={() => setMobileOpen(false)} aria-label="关闭侧边栏" />}
    <aside className={cn("fixed inset-y-0 left-0 z-50 w-[276px] border-r border-black/[.06] bg-sidebar transition-transform duration-200 md:hidden", mobileOpen ? "translate-x-0" : "-translate-x-full")}><button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 flex size-10 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-black/[.05]" aria-label="关闭侧边栏"><X className="size-4" /></button><SidebarContent compact={false} closeMobile={() => setMobileOpen(false)} currentPage="home" /></aside>
    <aside className={cn("fixed inset-y-0 left-0 z-30 hidden border-r border-black/[.06] bg-sidebar transition-[width] duration-200 md:block", compact ? "w-[68px]" : "w-[252px]")}><SidebarContent compact={compact} currentPage="home" /></aside>

    <section className={cn("min-h-screen transition-[padding] duration-200", compact ? "md:pl-[68px]" : "md:pl-[252px]")}>
      <header className="sticky top-0 z-20 flex h-16 items-center border-b border-black/[.055] bg-canvas/85 px-4 backdrop-blur-xl sm:px-6">
        <Button variant="ghost" size="icon" className="mr-2 md:hidden" onClick={() => setMobileOpen(true)} aria-label="打开侧边栏"><Menu className="size-[18px]" /></Button>
        <Button variant="ghost" size="icon" className="mr-2 hidden md:inline-flex" onClick={() => setCompact((value) => !value)} aria-label={compact ? "展开侧边栏" : "收起侧边栏"}><PanelLeftClose className={cn("size-[18px] transition-transform", compact && "rotate-180")} /></Button>
        <div className="h-4 w-px bg-black/10" /><div className="ml-3 flex min-w-0 items-center gap-2 text-sm"><span className="hidden text-soft sm:inline">Seek Team</span><span className="hidden text-soft sm:inline">/</span><span className="truncate font-medium">首页</span></div>
        <div className="ml-auto flex items-center"><Button variant="ghost" size="icon" aria-label="通知" className="relative"><Bell className="size-[17px]" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#29C16A] ring-2 ring-canvas" /></Button></div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[1120px] flex-col px-4 sm:px-8 lg:px-12">
        <section className="flex min-h-[52vh] flex-1 flex-col items-center justify-center pb-10 pt-12 text-center sm:pt-16">
          <SeekCompanion />
          <h1 className="mt-5 text-[28px] font-semibold tracking-[-.035em] sm:text-[34px]">{greeting}，Cybersh1t</h1>
        </section>

        <section className="mx-auto w-full max-w-4xl pb-10 sm:pb-12">
          <div className="mb-4 flex items-end justify-between"><div><h2 className="text-sm font-semibold">最近打开</h2><p className="mt-1 text-xs text-soft">继续上一次的阅读和编辑</p></div><button className="h-9 cursor-pointer rounded-lg px-2 text-xs text-muted transition-colors hover:bg-black/[.035] hover:text-ink">查看全部</button></div>
          <div className="overflow-hidden rounded-xl border border-black/[.06] bg-white shadow-[0_1px_2px_rgba(15,23,42,.025)]">
            <div className="hidden h-8 grid-cols-[minmax(0,1fr)_180px_110px] items-center border-b border-black/[.045] px-4 text-[10px] font-medium text-soft sm:grid"><span>名称</span><span>最后编辑</span><span className="text-right">打开时间</span></div>
            {documents.map((document) => <Link href={document.href as never} key={document.title} className="group grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-black/[.045] px-3 transition-colors last:border-0 hover:bg-[#f2faf5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#29C16A]/40 sm:grid-cols-[minmax(0,1fr)_180px_110px] sm:px-4">
              <span className="flex min-w-0 items-center gap-2.5"><FileText className="size-4 shrink-0 text-soft transition-colors group-hover:text-[#159B4E]" /><span className="min-w-0"><span className="block truncate text-[13px] font-medium">{document.title}</span><span className="block truncate text-[10px] text-soft sm:hidden">{document.project}</span></span></span>
              <span className="hidden min-w-0 items-center gap-2 text-[11px] text-muted sm:flex"><span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-black/[.045] text-[9px] font-medium">{document.initials}</span><span className="truncate">{document.author} · {document.project}</span></span>
              <span className="flex items-center justify-end gap-1.5 text-[11px] text-soft"><Clock3 className="size-3" />{document.updated}</span>
            </Link>)}
          </div>
        </section>
      </div>
    </section>
  </main>;
}
