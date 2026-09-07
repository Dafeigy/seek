import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth";
import { permissionService } from "@/lib/permissions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id, version } = await params;
  if (!(await permissionService.allows(session, id, "document:restore"))) return NextResponse.json({ error: "无权恢复该版本" }, { status: 403 });
  void version;
  return NextResponse.json({
    error: "为避免覆盖活跃协作草稿，请在文档版本历史面板中执行恢复",
    code: "REALTIME_RESTORE_REQUIRED",
  }, { status: 409 });
}
