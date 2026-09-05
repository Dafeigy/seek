import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth";
import { permissionService } from "@/lib/permissions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const access = await permissionService.allows(session, id, "document:read");
  if (!access) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  return NextResponse.json({
    token: permissionService.issueCollaborationToken(session, access),
    expiresIn: 120,
    canUpdate: access.permissions["document:update"],
  });
}
