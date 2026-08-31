import { DocumentWorkspace } from "@/components/document-workspace";
import { EditorLoader as SeekEditor } from "@/components/editor/editor-loader";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const title = id === "model-deployment" ? "模型部署规范" : "未命名文档";
  return <DocumentWorkspace title={title}><SeekEditor documentId={id} initialTitle={title} /></DocumentWorkspace>;
}
