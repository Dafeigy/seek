"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { DEFAULT_PROJECT, normalizeProject } from "@/lib/documents";

export default function NewDocumentPage() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const project = normalizeProject(new URLSearchParams(window.location.search).get("project"), DEFAULT_PROJECT);
    void fetch("/api/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project }),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Document creation failed: ${response.status}`);
      return response.json() as Promise<{ id: string }>;
    }).then(({ id }) => {
      window.dispatchEvent(new Event("seek:documents-changed"));
      router.replace(`/documents/${encodeURIComponent(id)}` as never);
    }).catch((error: unknown) => {
      console.error("Document creation failed.", error);
      started.current = false;
    });
  }, [router]);

  return <main className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">
    正在新建文档…
  </main>;
}
