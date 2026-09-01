import { DocumentWorkspace } from "@/components/document-workspace";
import { EditorLoader as SeekEditor } from "@/components/editor/editor-loader";

export default function NewDocumentPage() {
  return <DocumentWorkspace title="未命名文档" project="新建文档"><SeekEditor documentId="new-document" initialTitle="未命名文档" /></DocumentWorkspace>;
}
