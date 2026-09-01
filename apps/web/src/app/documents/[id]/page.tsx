import { DocumentWorkspace } from "@/components/document-workspace";
import { EditorLoader as SeekEditor } from "@/components/editor/editor-loader";

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const requestedProject = Array.isArray(query.project) ? query.project[0] : query.project;
  const project = requestedProject?.trim() || "平台基础设施";
  const title = id === "model-deployment" ? "模型部署规范" : "未命名文档";
  return <DocumentWorkspace documentId={id} title={title} project={project}><SeekEditor documentId={id} initialTitle={title} initialProject={project} /></DocumentWorkspace>;
}
