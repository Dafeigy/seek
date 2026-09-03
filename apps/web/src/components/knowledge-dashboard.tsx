"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, Bell, ChevronRight, ChevronsUpDown, Clock3, Copy, FileText, Folder, FolderInput,
  FolderLock, HelpCircle, Home, Inbox, Menu, MessageCircle, Mic2,
  MoreHorizontal, PanelLeftClose, Plus, Search, SlidersHorizontal, SquarePen, Trash2, Waves, X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "@/components/settings-dialog";
import { SeekCompanion } from "@/components/seek-companion";
import { collaborationCacheName } from "@/lib/collaboration-cache";
import { DEFAULT_PROJECT, PRIVATE_PROJECTS, TEAM_PROJECTS, type DocumentSummary, type ProjectSummary } from "@/lib/documents";
import { clearDocument } from "y-indexeddb";

function useDocuments() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const load = useCallback(() => {
    void fetch("/api/documents")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Document list failed: ${response.status}`);
        return response.json() as Promise<DocumentSummary[]>;
      })
      .then(setDocuments)
      .catch((error: unknown) => console.warn("Document list load failed.", error));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener("seek:documents-changed", load);
    return () => window.removeEventListener("seek:documents-changed", load);
  }, [load]);
  return { documents, reload: load };
}

const defaultProjects: ProjectSummary[] = [
  ...TEAM_PROJECTS.map((name) => ({ name, isPrivate: false })),
  ...PRIVATE_PROJECTS.map((name) => ({ name, isPrivate: true })),
];

function useProjects() {
  const [projects, setProjects] = useState<ProjectSummary[]>(defaultProjects);
  const load = useCallback(() => {
    void fetch("/api/projects")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Project list failed: ${response.status}`);
        return response.json() as Promise<ProjectSummary[]>;
      })
      .then(setProjects)
      .catch((error: unknown) => console.warn("Project list load failed.", error));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener("seek:projects-changed", load);
    return () => window.removeEventListener("seek:projects-changed", load);
  }, [load]);
  return { projects, reload: load };
}

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  if (elapsed < 60_000) return "刚刚";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  return `${Math.floor(elapsed / 86_400_000)} 天前`;
}

function greetingForNow() {
  const hour = new Date().getHours();
  return hour >= 5 && hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
}

type DocumentDialog = {
  kind: "move" | "copy" | "properties" | "delete";
  document: DocumentSummary;
};

const sidebarActionButtonClassName = "flex size-7 cursor-pointer items-center justify-center rounded-md text-soft transition-colors hover:bg-accent hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40";

export function SidebarContent({ compact, closeMobile, currentPage = "home" }: { compact: boolean; closeMobile?: () => void; currentPage?: "home" | "document" }) {
  const router = useRouter();
  const [expandedProjects, setExpandedProjects] = useState(() => new Set(["平台基础设施", "个人工作台"]));
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DocumentDialog | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftProject, setDraftProject] = useState<string>(DEFAULT_PROJECT);
  const [dialogSaving, setDialogSaving] = useState(false);
  const [projectDialog, setProjectDialog] = useState<{ isPrivate: boolean } | null>(null);
  const [draftProjectName, setDraftProjectName] = useState("");
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const { documents, reload } = useDocuments();
  const { projects, reload: reloadProjects } = useProjects();
  const projectNames = projects.map((project) => project.name);

  useEffect(() => {
    if (!dialog && !projectDialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (dialog && !dialogSaving) setDialog(null);
      if (projectDialog && !projectSaving) setProjectDialog(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog, dialogSaving, projectDialog, projectSaving]);

  function toggleProject(title: string) {
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  function openDialog(kind: DocumentDialog["kind"], document: DocumentSummary) {
    setDraftTitle(document.title);
    setDraftProject(kind === "move" || kind === "copy" ? projectNames.find((project) => project !== document.project) ?? document.project : document.project);
    setDialog({ kind, document });
  }

  function openProjectDialog(isPrivate: boolean) {
    setDraftProjectName("");
    setProjectError(null);
    setProjectDialog({ isPrivate });
  }

  async function createProject() {
    if (!projectDialog || !draftProjectName.trim()) return;
    setProjectSaving(true);
    setProjectError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: draftProjectName, isPrivate: projectDialog.isPrivate }),
      });
      if (response.status === 409) {
        setProjectError("同名项目已经存在");
        return;
      }
      if (!response.ok) throw new Error(`Project creation failed: ${response.status}`);
      const project = await response.json() as ProjectSummary;
      setExpandedProjects((current) => new Set(current).add(project.name));
      setOperationStatus(`已创建项目“${project.name}”`);
      setProjectDialog(null);
      reloadProjects();
      window.dispatchEvent(new Event("seek:projects-changed"));
      window.setTimeout(() => setOperationStatus(null), 1800);
    } catch (error) {
      console.warn("Project creation failed.", error);
      setProjectError("新建项目失败，请重试");
    } finally {
      setProjectSaving(false);
    }
  }

  async function changeProject(document: DocumentSummary, project: string, copy: boolean) {
    if (!copy && document.project === project) return true;
    setOperationStatus(copy ? "正在复制文档…" : "正在移动文档…");
    try {
      const response = await fetch(copy ? "/api/documents" : `/api/documents/${encodeURIComponent(document.id)}`, {
        method: copy ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(copy ? { sourceDocumentId: document.id, project } : { project }),
      });
      if (!response.ok) throw new Error(`Document operation failed: ${response.status}`);
      setExpandedProjects((current) => new Set(current).add(project));
      setOperationStatus(copy ? `已复制到“${project}”` : `已移动到“${project}”`);
      reload();
      window.dispatchEvent(new Event("seek:documents-changed"));
      window.setTimeout(() => setOperationStatus(null), 1800);
      return true;
    } catch (error) {
      console.warn("Document project operation failed.", error);
      setOperationStatus("操作失败，请重试");
      return false;
    }
  }

  async function saveProperties(document: DocumentSummary) {
    const response = await fetch(`/api/documents/${encodeURIComponent(document.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: draftTitle, project: draftProject }),
    });
    if (!response.ok) throw new Error(`Property update failed: ${response.status}`);
    setExpandedProjects((current) => new Set(current).add(draftProject));
    setOperationStatus("文档属性已保存");
    reload();
    window.dispatchEvent(new Event("seek:documents-changed"));
    window.setTimeout(() => setOperationStatus(null), 1800);
  }

  async function deleteDocument(document: DocumentSummary) {
    const response = await fetch(`/api/documents/${encodeURIComponent(document.id)}`, { method: "DELETE" });
    if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
    void clearDocument(collaborationCacheName(document.id));
    setOperationStatus(`已删除“${document.title}”`);
    reload();
    window.dispatchEvent(new Event("seek:documents-changed"));
    if (window.location.pathname === `/documents/${encodeURIComponent(document.id)}`) {
      router.replace("/" as never);
      return;
    }
    window.setTimeout(() => setOperationStatus(null), 1800);
  }

  async function submitDialog() {
    if (!dialog) return;
    setDialogSaving(true);
    try {
      if (dialog.kind === "move" || dialog.kind === "copy") {
        const changed = await changeProject(dialog.document, draftProject, dialog.kind === "copy");
        if (!changed) return;
      } else if (dialog.kind === "properties") {
        await saveProperties(dialog.document);
      } else {
        await deleteDocument(dialog.document);
      }
      setDialog(null);
    } catch (error) {
      console.warn("Document dialog operation failed.", error);
      setOperationStatus("操作失败，请重试");
    } finally {
      setDialogSaving(false);
    }
  }

  function onDrop(event: React.DragEvent, project: string) {
    event.preventDefault();
    setDropTarget(null);
    const id = event.dataTransfer.getData("application/x-seek-document");
    const document = documents.find((item) => item.id === id);
    if (document) void changeProject(document, project, event.altKey);
  }

  const renderProjectSection = (label: string, sectionProjects: readonly string[], isPrivate = false) => <section aria-labelledby={`sidebar-${label}`}>
    <div className="mb-1 mt-5 flex h-8 items-center justify-between px-3 text-[11px] font-medium text-soft">
      <span id={`sidebar-${label}`}>{label}</span>
      <Button type="button" variant="ghost" size="icon" onClick={() => openProjectDialog(isPrivate)} className={sidebarActionButtonClassName} aria-label={`新建${label}`} title="新建项目"><Plus className="size-3.5" /></Button>
    </div>
    <div className="space-y-0.5">{sectionProjects.map((project) => {
      const projectDocuments = documents.filter((document) => document.project === project);
      const expanded = expandedProjects.has(project);
      return <div key={project} onDragEnter={() => setDropTarget(project)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = event.altKey ? "copy" : "move"; }} onDrop={(event) => onDrop(event, project)}>
        <div className={cn("group/project flex h-9 items-center rounded-lg transition-colors hover:bg-accent", dropTarget === project && "bg-success-soft ring-1 ring-brand/40")}>
        <Button variant="ghost" onClick={() => toggleProject(project)} aria-expanded={expanded} className="flex min-w-0 flex-1 justify-start gap-1.5 rounded-lg px-2 text-[13px] text-muted hover:bg-transparent hover:text-ink">
          <ChevronRight className={cn("size-3.5 shrink-0 text-soft transition-transform duration-200", expanded && "rotate-90")} />
          {isPrivate ? <FolderLock className="size-3.5 shrink-0 text-soft group-hover/project:text-brand-deep" /> : <Folder className="size-3.5 shrink-0 text-soft group-hover/project:text-brand-deep" />}
          <span className="min-w-0 flex-1 truncate text-left">{project}</span>
        </Button>
        <span className="relative mr-3 size-7 shrink-0">
          <span aria-label={`${projectDocuments.length} 篇文档`} className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-soft transition-opacity group-hover/project:opacity-0 group-focus-within/project:opacity-0">{projectDocuments.length}</span>
          <Button asChild variant="ghost" size="icon" className={cn(sidebarActionButtonClassName, "absolute inset-0 opacity-0 transition-opacity group-hover/project:opacity-100 focus:opacity-100")}><Link href={`/documents/new?project=${encodeURIComponent(project)}` as never} onClick={closeMobile} aria-label={`在${project}中新建文档`} title="新建文档"><Plus className="size-3.5" /></Link></Button>
        </span>
        </div>
        {expanded && <div className="ml-[15px] border-l border-border pl-2">{projectDocuments.length === 0 ? <p className="px-2 py-1.5 text-[11px] text-soft">当前项目还没有文档哦</p> : projectDocuments.map((document) => <div
          draggable
          onDragStart={(event) => { event.dataTransfer.setData("application/x-seek-document", document.id); event.dataTransfer.effectAllowed = "copyMove"; }}
          key={document.id}
          title="拖拽移动；按住 Alt/Option 拖拽复制"
          className="group/document relative flex h-8 items-center rounded-lg transition-colors hover:bg-accent"
        >
          <Button asChild variant="ghost" size="sm" className="h-8 min-w-0 flex-1 justify-start rounded-lg px-2 text-[12px] font-normal text-muted hover:bg-transparent hover:text-ink"><Link onClick={closeMobile} href={`/documents/${encodeURIComponent(document.id)}` as never}><FileText className="size-3.5 shrink-0 text-soft group-hover/document:text-brand-deep" /><span className="truncate">{document.title}</span></Link></Button>
          <details className="relative mr-3">
            <Button asChild variant="ghost" size="icon" className={cn(sidebarActionButtonClassName, "list-none opacity-0 group-hover/document:opacity-100 focus:opacity-100")}><summary aria-label={`${document.title}操作`}><MoreHorizontal className="size-3.5" /></summary></Button>
            <div className="absolute right-0 top-7 z-50 w-44 rounded-xl border border-border bg-card p-1.5 shadow-xl">
              <Button type="button" variant="ghost" size="sm" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); openDialog("move", document); }} className="h-8 w-full justify-start rounded-lg px-2 text-left text-[12px] font-normal"><FolderInput className="size-3.5 text-soft" />移动</Button>
              <Button type="button" variant="ghost" size="sm" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); openDialog("copy", document); }} className="h-8 w-full justify-start rounded-lg px-2 text-left text-[12px] font-normal"><Copy className="size-3.5 text-soft" />复制到</Button>
              <Button type="button" variant="ghost" size="sm" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); openDialog("properties", document); }} className="h-8 w-full justify-start rounded-lg px-2 text-left text-[12px] font-normal"><SlidersHorizontal className="size-3.5 text-soft" />设置文档属性</Button>
              <div className="my-1 h-px bg-border" />
              <Button type="button" variant="ghost" size="sm" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); openDialog("delete", document); }} className="h-8 w-full justify-start rounded-lg px-2 text-left text-[12px] font-normal text-destructive hover:bg-danger-soft"><Trash2 className="size-3.5" />删除文档</Button>
            </div>
          </details>
        </div>)}</div>}
      </div>;
    })}</div>
  </section>;

  const dialogTitle = dialog?.kind === "move" ? "移动文档"
    : dialog?.kind === "copy" ? "复制文档"
      : dialog?.kind === "properties" ? "文档属性"
        : "删除文档";

  return <div className="flex h-full flex-col">
    <div className={cn("flex h-16 items-center", compact ? "justify-center px-2" : "px-3")}>
      <Button type="button" variant="ghost" className={cn("group h-auto min-w-0 rounded-xl p-2 text-left", compact ? "justify-center" : "w-full justify-start gap-2.5")} aria-label="切换工作区">
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground shadow-sm">S<span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-sidebar bg-brand" /></span>
        {!compact && <><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold tracking-tight">Seek Team</span><span className="block text-[11px] text-muted">团队工作区</span></span><ChevronsUpDown className="size-3.5 text-muted" /></>}
      </Button>
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
          const className = cn(
            "group rounded-xl",
            compact ? "w-full" : item.active ? "min-w-0 flex-1" : "w-10 shrink-0",
          );
          const content = <><item.icon className={cn("size-[17px] shrink-0", item.active && "text-brand-deep")} />{!compact && item.active && <span className="truncate text-[13px] font-medium">{item.label}</span>}</>;
          return item.href
            ? <Button key={item.label} asChild variant={item.active ? "secondary" : "ghost"} size={item.active && !compact ? "default" : "icon"} className={className}>
              <Link href={item.href as never} title={item.label} onClick={closeMobile} aria-current={item.active ? "page" : undefined}>{content}</Link>
            </Button>
            : <Button key={item.label} type="button" variant="ghost" size="icon" title={item.label} onClick={closeMobile} className={className}>{content}</Button>;
        })}
      </nav>
      {!compact && <>
        <div className="my-4 h-px bg-border" />
        <nav aria-label="知识导航"><Button variant="ghost" onClick={closeMobile} className="group h-9 w-full justify-start gap-2.5 rounded-lg px-3 text-[13px] text-muted"><Waves className="size-4 text-soft group-hover:text-brand-deep" /><span>知识海</span></Button></nav>
        {operationStatus && <p role="status" className="mx-2 mt-3 rounded-lg bg-success-soft px-2 py-1.5 text-[11px] text-success-foreground">{operationStatus}</p>}
        {renderProjectSection("项目", projects.filter((project) => !project.isPrivate).map((project) => project.name))}
        {renderProjectSection("私人项目", projects.filter((project) => project.isPrivate).map((project) => project.name), true)}
      </>}
    </div>
    <div className="border-t border-border p-2">
      <Button type="button" variant="ghost" title={compact ? "回收站" : undefined} className={cn("h-9 w-full rounded-lg text-[13px] text-muted", compact ? "justify-center" : "justify-start gap-2.5 px-3")}><Trash2 className="size-4" />{!compact && "回收站"}</Button>
      <SettingsDialog compact={compact} />
      <Button type="button" variant="ghost" title={compact ? "帮助与反馈" : undefined} className={cn("h-9 w-full rounded-lg text-[13px] text-muted", compact ? "justify-center" : "justify-start gap-2.5 px-3")}><HelpCircle className="size-4" />{!compact && "帮助与反馈"}</Button>
      <div className={cn("mt-2 flex border-t border-border pt-2", compact ? "flex-col gap-1" : "gap-1.5")}>
        <Button type="button" variant="outline" title={compact ? "新建会话" : undefined} className={cn("h-11 rounded-full text-[12px]", compact ? "w-11 self-center px-0" : "min-w-0 flex-1")} aria-label="新建会话"><MessageCircle className="size-4 shrink-0 text-brand-deep" />{!compact && <span className="truncate">新建会话</span>}</Button>
        <Button asChild variant="outline" size="icon" className="size-11 self-center rounded-full text-brand-deep"><Link href={"/documents/new" as never} onClick={closeMobile} title="新建文档" aria-label="新建文档"><SquarePen className="size-4" /></Link></Button>
      </div>
    </div>
    {projectDialog && createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
      <Button type="button" variant="ghost" className="absolute inset-0 h-auto w-auto cursor-default rounded-none bg-black/25 p-0 backdrop-blur-[2px] hover:bg-black/25" onClick={() => { if (!projectSaving) setProjectDialog(null); }} aria-label="关闭对话框" />
      <form onSubmit={(event) => { event.preventDefault(); void createProject(); }} role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1"><h2 id="project-dialog-title" className="text-base font-semibold">新建{projectDialog.isPrivate ? "私人" : ""}项目</h2><p className="mt-1 text-xs text-soft">创建后即可在项目中添加和管理文档。</p></div>
          <Button type="button" variant="ghost" size="icon" disabled={projectSaving} onClick={() => setProjectDialog(null)} className="size-8 text-soft" aria-label="关闭"><X className="size-4" /></Button>
        </div>
        <label className="mt-5 block"><span className="mb-1.5 block text-xs font-medium text-muted">项目名称</span><input autoFocus value={draftProjectName} maxLength={60} onChange={(event) => { setDraftProjectName(event.target.value); setProjectError(null); }} placeholder="输入项目名称" className="h-10 w-full rounded-xl border border-border px-3 text-sm outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/10" /></label>
        {projectError && <p role="alert" className="mt-2 text-xs text-destructive">{projectError}</p>}
        <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" disabled={projectSaving} onClick={() => setProjectDialog(null)} size="sm">取消</Button><Button type="submit" disabled={projectSaving || !draftProjectName.trim()} size="sm" className="bg-brand-solid text-brand-solid-foreground hover:bg-brand-solid/90">{projectSaving ? "创建中…" : "创建"}</Button></div>
      </form>
    </div>, document.body)}
    {dialog && createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
      <Button type="button" variant="ghost" className="absolute inset-0 h-auto w-auto cursor-default rounded-none bg-black/25 p-0 backdrop-blur-[2px] hover:bg-black/25" onClick={() => { if (!dialogSaving) setDialog(null); }} aria-label="关闭对话框" />
      <section role="dialog" aria-modal="true" aria-labelledby="document-dialog-title" className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1"><h2 id="document-dialog-title" className="text-base font-semibold">{dialogTitle}</h2><p className="mt-1 truncate text-xs text-soft">{dialog.document.title}</p></div>
          <Button type="button" variant="ghost" size="icon" disabled={dialogSaving} onClick={() => setDialog(null)} className="size-8 text-soft" aria-label="关闭"><X className="size-4" /></Button>
        </div>

        {(dialog.kind === "move" || dialog.kind === "copy") && <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-muted">选择目标项目</p>
          <div className="grid gap-2">{projectNames.map((project) => {
            const disabled = dialog.kind === "move" && project === dialog.document.project;
            return <label key={project} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors", draftProject === project ? "border-brand/50 bg-success-soft" : "border-border hover:bg-accent", disabled && "cursor-not-allowed opacity-45")}>
              <input type="radio" name="target-project" value={project} checked={draftProject === project} disabled={disabled} onChange={() => setDraftProject(project)} className="accent-brand-deep" />
              <Folder className="size-4 text-soft" /><span className="flex-1">{project}</span>{project === dialog.document.project && <span className="text-[10px] text-soft">当前项目</span>}
            </label>;
          })}</div>
          {dialog.kind === "copy" && <p className="mt-3 text-xs text-soft">将创建一份内容相同、可独立编辑的新文档。</p>}
        </div>}

        {dialog.kind === "properties" && <div className="mt-5 space-y-4">
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-muted">文档标题</span><input autoFocus value={draftTitle} maxLength={120} onChange={(event) => setDraftTitle(event.target.value)} className="h-10 w-full rounded-xl border border-border px-3 text-sm outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/10" /></label>
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-muted">所属项目</span><select value={draftProject} onChange={(event) => setDraftProject(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/10">{projectNames.map((project) => <option key={project} value={project}>{project}</option>)}</select></label>
          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted p-3 text-xs"><div><dt className="text-soft">创建时间</dt><dd className="mt-1 text-muted">{new Date(dialog.document.createdAt).toLocaleString("zh-CN")}</dd></div><div><dt className="text-soft">最近更新</dt><dd className="mt-1 text-muted">{new Date(dialog.document.updatedAt).toLocaleString("zh-CN")}</dd></div></dl>
        </div>}

        {dialog.kind === "delete" && <div className="mt-5 flex gap-3 rounded-xl bg-danger-soft p-4 text-destructive"><AlertTriangle className="mt-0.5 size-5 shrink-0" /><div><p className="text-sm font-medium">确定删除这篇文档吗？</p><p className="mt-1 text-xs leading-5 text-destructive">文档内容和版本历史将被永久删除，此操作无法撤销。</p></div></div>}

        <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" disabled={dialogSaving} onClick={() => setDialog(null)} size="sm">取消</Button><Button type="button" autoFocus={dialog.kind !== "properties"} variant={dialog.kind === "delete" ? "destructive" : "default"} disabled={dialogSaving || ((dialog.kind === "move" || dialog.kind === "copy") && !draftProject) || (dialog.kind === "properties" && !draftTitle.trim())} onClick={() => void submitDialog()} size="sm" className={dialog.kind !== "delete" ? "bg-brand-solid text-brand-solid-foreground hover:bg-brand-solid/90" : undefined}>{dialogSaving ? "处理中…" : dialog.kind === "move" ? "移动" : dialog.kind === "copy" ? "创建副本" : dialog.kind === "properties" ? "保存" : "确认删除"}</Button></div>
      </section>
    </div>, document.body)}
  </div>;
}

export function KnowledgeDashboard() {
  const [compact, setCompact] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [greeting] = useState(greetingForNow);
  const { documents } = useDocuments();

  return <main className="min-h-screen bg-canvas text-ink">
    {mobileOpen && <Button type="button" variant="ghost" className="fixed inset-0 z-40 h-auto w-auto cursor-default rounded-none bg-black/20 p-0 backdrop-blur-[2px] hover:bg-black/20 md:hidden" onClick={() => setMobileOpen(false)} aria-label="关闭侧边栏" />}
    <aside className={cn("fixed inset-y-0 left-0 z-50 w-[331.2px] border-r border-border bg-sidebar transition-transform duration-200 md:hidden", mobileOpen ? "translate-x-0" : "-translate-x-full")}><Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 size-10 text-muted" aria-label="关闭侧边栏"><X className="size-4" /></Button><SidebarContent compact={false} closeMobile={() => setMobileOpen(false)} currentPage="home" /></aside>
    <aside className={cn("fixed inset-y-0 left-0 z-30 hidden border-r border-border bg-sidebar transition-[width] duration-200 md:block", compact ? "w-[68px]" : "w-[302.4px]")}><SidebarContent compact={compact} currentPage="home" /></aside>

    <section className={cn("min-h-screen transition-[padding] duration-200", compact ? "md:pl-[68px]" : "md:pl-[302.4px]")}>
      <header className="sticky top-0 z-20 flex h-16 items-center border-b border-border bg-canvas/85 px-4 backdrop-blur-xl sm:px-6">
        <Button variant="ghost" size="icon" className="mr-2 md:hidden" onClick={() => setMobileOpen(true)} aria-label="打开侧边栏"><Menu className="size-[18px]" /></Button>
        <Button variant="ghost" size="icon" className="mr-2 hidden md:inline-flex" onClick={() => setCompact((value) => !value)} aria-label={compact ? "展开侧边栏" : "收起侧边栏"}><PanelLeftClose className={cn("size-[18px] transition-transform", compact && "rotate-180")} /></Button>
        <div className="h-4 w-px bg-border" /><div className="ml-3 flex min-w-0 items-center gap-2 text-sm"><span className="hidden text-soft sm:inline">Seek Team</span><span className="hidden text-soft sm:inline">/</span><span className="truncate font-medium">首页</span></div>
        <div className="ml-auto flex items-center"><Button variant="ghost" size="icon" aria-label="通知" className="relative"><Bell className="size-[17px]" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-brand ring-2 ring-canvas" /></Button></div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[1120px] flex-col px-4 sm:px-8 lg:px-12">
        <section className="flex min-h-[52vh] flex-1 flex-col items-center justify-center pb-10 pt-12 text-center sm:pt-16">
          <SeekCompanion />
          <h1 className="mt-5 text-[28px] font-semibold tracking-[-.035em] sm:text-[34px]">{greeting}，Cybersh1t</h1>
        </section>

        <section className="mx-auto w-full max-w-4xl pb-10 sm:pb-12">
          <div className="mb-4 flex items-end justify-between"><div><h2 className="text-sm font-semibold">最近打开</h2><p className="mt-1 text-xs text-soft">继续上一次的阅读和编辑</p></div><Button type="button" variant="ghost" size="sm" className="h-9 px-2 text-xs text-muted">查看全部</Button></div>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,.025)]">
            <div className="hidden h-8 grid-cols-[minmax(0,1fr)_180px_110px] items-center border-b border-border px-4 text-[10px] font-medium text-soft sm:grid"><span>名称</span><span>最后编辑</span><span className="text-right">打开时间</span></div>
            {documents.length === 0 && <div className="px-4 py-8 text-center text-xs text-soft">还没有文档。点击左下角的新建文档开始记录。</div>}
            {documents.slice(0, 4).map((document) => <Link href={`/documents/${encodeURIComponent(document.id)}` as never} key={document.id} className="group grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-3 transition-colors last:border-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40 sm:grid-cols-[minmax(0,1fr)_180px_110px] sm:px-4">
              <span className="flex min-w-0 items-center gap-2.5"><FileText className="size-4 shrink-0 text-soft transition-colors group-hover:text-brand-deep" /><span className="min-w-0"><span className="block truncate text-[13px] font-medium">{document.title}</span><span className="block truncate text-[10px] text-soft sm:hidden">{document.project}</span></span></span>
              <span className="hidden min-w-0 items-center gap-2 text-[11px] text-muted sm:flex"><span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-medium">你</span><span className="truncate">你 · {document.project}</span></span>
              <span className="flex items-center justify-end gap-1.5 text-[11px] text-soft"><Clock3 className="size-3" />{relativeTime(document.updatedAt)}</span>
            </Link>)}
          </div>
        </section>
      </div>
    </section>
  </main>;
}
