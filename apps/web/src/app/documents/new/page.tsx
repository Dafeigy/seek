"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createDocumentId, DEFAULT_PROJECT, normalizeProject } from "@/lib/documents";

export default function NewDocumentPage() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const project = normalizeProject(new URLSearchParams(window.location.search).get("project"), DEFAULT_PROJECT);
    const id = createDocumentId();
    router.replace(`/documents/${encodeURIComponent(id)}?project=${encodeURIComponent(project)}` as never);
  }, [router]);

  return <main className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">
    正在新建文档…
  </main>;
}
