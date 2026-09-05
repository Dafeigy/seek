"use client";

import dynamic from "next/dynamic";
import type { DocumentBootstrap } from "@/lib/documents";

const SeekEditor = dynamic(
  () => import("@/components/editor/seek-editor").then((module) => module.SeekEditor),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-[680px]"
        aria-label="正在加载编辑器"
      />
    ),
  },
);

export function EditorLoader(props: { bootstrap: DocumentBootstrap }) {
  return <SeekEditor {...props} />;
}
