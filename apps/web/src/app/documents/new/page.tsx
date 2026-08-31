import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EditorLoader as SeekEditor } from "@/components/editor/editor-loader";

export default function NewDocumentPage() {
  return <main className="min-h-screen bg-slate-50 px-5 py-6 text-slate-900"><div className="mx-auto max-w-6xl"><Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={16} />返回知识库</Link><div className="mb-5"><p className="text-sm text-slate-500">新建文档</p><h1 className="mt-1 text-2xl font-semibold">未命名文档</h1></div><SeekEditor documentId="new-document" initialTitle="未命名文档" /></div></main>;
}
