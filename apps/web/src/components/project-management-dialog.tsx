"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Copy, Trash2, UserPlus, X } from "lucide-react";

import type { ProjectSummary } from "@/lib/documents";
import { Button } from "@/components/ui/button";

type Kind = "properties" | "members" | "delete";
type Member = { id: string; email: string; displayName: string; role: ProjectRole };
type Pending = { id: string; email: string; role: ProjectRole; expiresAt: string };
type ProjectRole = "admin" | "editor" | "commenter" | "viewer";

const roleLabels: Record<ProjectRole, string> = { admin: "项目管理员", editor: "编辑者", commenter: "评论者", viewer: "查看者" };

export function ProjectManagementDialog({ kind, project, onClose, onChanged }: {
  kind: Kind;
  project: ProjectSummary;
  onClose: () => void;
  onChanged: (next?: ProjectSummary) => void;
}) {
  const [name, setName] = useState(project.name);
  const [isPrivate, setIsPrivate] = useState(project.isPrivate);
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("editor");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const endpoint = `/api/projects/${encodeURIComponent(project.name)}`;

  const loadMembers = async () => {
    const response = await fetch(`${endpoint}/members`);
    if (!response.ok) throw new Error("无法读取项目成员");
    const data = await response.json() as { members: Member[]; pending: Pending[] };
    setMembers(data.members);
    setPending(data.pending);
  };

  useEffect(() => {
    if (kind !== "members") return;
    let cancelled = false;
    void fetch(`${endpoint}/members`).then(async (response) => {
      if (!response.ok) throw new Error("无法读取项目成员");
      return response.json() as Promise<{ members: Member[]; pending: Pending[] }>;
    }).then((data) => {
      if (cancelled) return;
      setMembers(data.members);
      setPending(data.pending);
    }).catch((error: Error) => { if (!cancelled) setStatus(error.message); });
    return () => { cancelled = true; };
  }, [endpoint, kind]);

  async function saveProperties() {
    setBusy(true);
    const response = await fetch(endpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, isPrivate }) });
    const data = await response.json() as ProjectSummary & { error?: string };
    setBusy(false);
    if (!response.ok) return setStatus(data.error ?? "项目属性保存失败");
    onChanged(data);
    onClose();
  }

  async function invite() {
    if (!email.trim()) return;
    setBusy(true);
    setStatus(null);
    const response = await fetch(`${endpoint}/members`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role }) });
    const data = await response.json() as { error?: string; joined?: boolean; invitationLink?: string };
    setBusy(false);
    if (!response.ok) return setStatus(data.error ?? "邀请失败");
    setEmail("");
    if (data.invitationLink) {
      await navigator.clipboard.writeText(data.invitationLink).catch(() => undefined);
      setStatus("邀请链接已复制；对方接受后会自动加入项目");
    } else setStatus(data.joined ? "成员已加入项目" : "邀请邮件已发送");
    await loadMembers();
  }

  async function updateMember(member: Member, nextRole: ProjectRole) {
    await fetch(`${endpoint}/members`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: member.id, role: nextRole }) });
    await loadMembers();
    onChanged();
  }

  async function removeMember(member: Member) {
    await fetch(`${endpoint}/members?userId=${encodeURIComponent(member.id)}`, { method: "DELETE" });
    await loadMembers();
    onChanged();
  }

  async function deleteProject() {
    setBusy(true);
    const response = await fetch(endpoint, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) return setStatus("项目删除失败");
    onChanged();
    onClose();
  }

  const title = kind === "properties" ? "项目属性" : kind === "members" ? "项目成员管理" : "删除项目";
  return <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
    <Button type="button" variant="ghost" className="absolute inset-0 h-auto w-auto cursor-default rounded-none bg-black/25 p-0 backdrop-blur-[2px] hover:bg-black/25" onClick={onClose} aria-label="关闭对话框" />
    <section role="dialog" aria-modal="true" aria-labelledby="project-management-title" className="relative max-h-[min(720px,calc(100vh-2rem))] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl">
      <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h2 id="project-management-title" className="text-base font-semibold">{title}</h2><p className="mt-1 truncate text-xs text-soft">{project.name}</p></div><Button type="button" variant="ghost" size="icon" onClick={onClose} className="size-8 text-soft" aria-label="关闭"><X className="size-4" /></Button></div>

      {kind === "properties" && <div className="mt-5 space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-medium text-muted">项目名称</span><input autoFocus value={name} maxLength={60} onChange={(event) => setName(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus:border-brand/50" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} className="accent-brand-deep" />私人项目</label></div>}

      {kind === "members" && <div className="mt-5"><div className="grid gap-2 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-[1fr_120px_auto]"><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="member@example.com" className="h-9 min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm" /><select value={role} onChange={(event) => setRole(event.target.value as ProjectRole)} className="h-9 rounded-lg border border-input bg-card px-2 text-xs">{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Button type="button" size="sm" onClick={() => void invite()} disabled={busy || !email.trim()}><UserPlus className="size-4" />邀请</Button></div>
        <div className="mt-4 overflow-hidden rounded-xl border border-border">{members.map((member) => <div key={member.id} className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-0"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.displayName}</p><p className="truncate text-xs text-soft">{member.email}</p></div><select aria-label={`${member.displayName}的项目角色`} value={member.role} onChange={(event) => void updateMember(member, event.target.value as ProjectRole)} className="h-8 rounded-lg border border-input bg-card px-2 text-xs">{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Button type="button" variant="ghost" size="icon" onClick={() => void removeMember(member)} className="size-8 text-destructive" aria-label={`移除${member.displayName}`}><Trash2 className="size-4" /></Button></div>)}{members.length === 0 && <p className="p-4 text-center text-xs text-soft">暂无项目成员</p>}</div>
        {pending.length > 0 && <div className="mt-4"><p className="mb-2 text-xs font-medium text-muted">等待接受邀请</p>{pending.map((invite) => <div key={invite.id} className="flex items-center gap-2 py-1 text-xs text-soft"><Copy className="size-3.5" /><span className="min-w-0 flex-1 truncate">{invite.email}</span><span>{roleLabels[invite.role]}</span></div>)}</div>}</div>}

      {kind === "delete" && <div className="mt-5 flex gap-3 rounded-xl bg-danger-soft p-4 text-destructive"><AlertTriangle className="mt-0.5 size-5 shrink-0" /><div><p className="text-sm font-medium">确定删除这个项目吗？</p><p className="mt-1 text-xs leading-5">项目及其中的文档会移入回收站，并保留 30 天恢复期。</p></div></div>}
      {status && <p role="status" className="mt-3 text-xs text-muted">{status}</p>}
      {kind !== "members" && <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose} size="sm">取消</Button><Button type="button" variant={kind === "delete" ? "destructive" : "default"} disabled={busy || (kind === "properties" && !name.trim())} onClick={() => void (kind === "delete" ? deleteProject() : saveProperties())} size="sm">{busy ? "处理中…" : kind === "delete" ? "确认删除" : "保存"}</Button></div>}
    </section>
  </div>;
}
