import Link from "next/link";
import { BookOpen, FileText, Search, Settings2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";

const documents = [
  { title: "模型部署规范", project: "平台基础设施", updated: "刚刚" },
  { title: "服务监控与告警", project: "平台基础设施", updated: "昨天" },
  { title: "实验记录模板", project: "算法研究", updated: "3 天前" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
          <div className="mb-8 flex items-center gap-2 px-2 text-lg font-semibold">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm text-white">S</div>
            Seek
          </div>
          <nav className="space-y-1 text-sm">
            <Button variant="secondary" className="w-full justify-start"><BookOpen size={16} />知识库</Button>
            <Button variant="ghost" className="w-full justify-start"><Users size={16} />团队成员</Button>
            <Button variant="ghost" className="w-full justify-start"><Settings2 size={16} />工作区设置</Button>
          </nav>
          <div className="mt-10 px-2 text-xs font-medium uppercase tracking-wider text-slate-400">Projects</div>
          <div className="mt-3 space-y-2 px-2 text-sm text-slate-600">
            <div>平台基础设施</div>
            <div>算法研究</div>
            <div>客户端</div>
          </div>
        </aside>

        <section className="flex-1 p-6 md:p-10">
          <div className="mx-auto max-w-4xl">
            <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm text-slate-500">Workspace / Seek Team</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">知识库</h1>
              </div>
              <Button asChild><Link href={"/documents/new" as never}>新建文档</Link></Button>
            </header>

            <div className="relative mt-8">
              <Search className="absolute left-3 top-3 text-slate-400" size={18} />
              <input
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none ring-offset-2 placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                placeholder="搜索文档、项目和内容…"
                aria-label="搜索文档"
              />
            </div>

            <div className="mt-10 flex items-center justify-between">
              <h2 className="text-base font-semibold">最近更新</h2>
              <button className="text-sm text-slate-500 hover:text-slate-900">查看全部</button>
            </div>

            <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {documents.map((document) => (
                <Link href={(document.title === "模型部署规范" ? "/documents/model-deployment" : "/documents/new") as never} key={document.title} className="flex items-center gap-4 p-4 transition-colors hover:bg-slate-50">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium">{document.title}</h3>
                    <p className="mt-1 text-xs text-slate-500">{document.project}</p>
                  </div>
                  <time className="text-xs text-slate-400">{document.updated}</time>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
