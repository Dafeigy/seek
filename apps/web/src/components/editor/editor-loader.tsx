"use client";

import dynamic from "next/dynamic";

const SeekEditor = dynamic(
  () => import("@/components/editor/seek-editor").then((module) => module.SeekEditor),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-[680px] animate-pulse rounded-2xl border border-slate-200 bg-white"
        aria-label="正在加载编辑器"
      />
    ),
  },
);

export function EditorLoader(props: { documentId: string; initialTitle: string }) {
  return <SeekEditor {...props} />;
}
