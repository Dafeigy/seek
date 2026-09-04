import { KnowledgeDashboard } from "@/components/knowledge-dashboard";
import { getCurrentSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function WorkspaceLayout() {
  if (!(await getCurrentSession())) redirect("/login");
  return <KnowledgeDashboard />;
}
