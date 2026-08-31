import Link from "next/link";
import { ArrowLeft, History, MoreHorizontal, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorLoader as SeekEditor } from "@/components/editor/editor-loader";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const title = id === "model-deployment" ? "模型部署规范" : "未命名文档";
  return <main className="min-h-screen bg-slate-50 text-slate-900"><header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur"><div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" asChild><Link href="/"><ArrowLeft size={18} /></Link></Button><div><p className="text-xs text-slate-400">平台基础设施 / 文档</p><p className="text-sm font-medium">{title}</p></div></div><div className="flex items-center gap-1"><Button variant="ghost" size="sm"><History size={16} />版本历史</Button><Button variant="ghost" size="icon"><Share2 size={17} /></Button><Button variant="ghost" size="icon"><MoreHorizontal size={17} /></Button></div></div></header><section className="mx-auto max-w-6xl px-5 py-8"><div className="mb-5 flex items-center justify-between"><div><p className="text-sm text-slate-500">最后编辑：你 · 自动保存</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1></div><div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Editor</div></div><SeekEditor documentId={id} initialTitle={title} /></section></main>;
}
