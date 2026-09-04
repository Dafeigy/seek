"use client";

import { useSearchParams } from "next/navigation";
import { GalleryVerticalEndIcon } from "lucide-react";
import { LoginForm } from "@/components/login-form";

export default function AcceptInvitationPage() {
  const token = useSearchParams().get("token") ?? undefined;
  return <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6"><div className="w-full max-w-sm rounded-2xl border bg-card p-7 shadow-sm"><div className="mb-6 flex items-center gap-2 font-medium"><span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><GalleryVerticalEndIcon className="size-4" /></span>Seek</div>{token ? <LoginForm mode="invite" token={token} /> : <p className="text-sm text-destructive">邀请链接缺少必要信息。</p>}</div></main>;
}
