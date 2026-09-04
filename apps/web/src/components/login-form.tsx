"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Mode = "login" | "setup" | "invite";

export function LoginForm({ mode = "login", token, className }: { mode?: Mode; token?: string; className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labels = mode === "login" ? { title: "登录 Seek", description: "使用你的 Workspace 邮箱和密码继续", submit: "登录" } : mode === "setup" ? { title: "创建第一个 Workspace", description: "这会创建 Workspace Owner；之后只能通过邀请加入。", submit: "创建并进入 Seek" } : { title: "接受 Workspace 邀请", description: "设置密码后即可加入并登录 Seek。", submit: "设置密码并加入" };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null);
    const data = new FormData(event.currentTarget);
    const endpoint = mode === "login" ? "/api/auth/login" : mode === "setup" ? "/api/auth/setup" : "/api/auth/accept-invitation";
    const body = mode === "login" ? { email: data.get("email"), password: data.get("password") } : mode === "setup" ? { email: data.get("email"), password: data.get("password"), displayName: data.get("displayName"), workspaceName: data.get("workspaceName") } : { token, password: data.get("password"), displayName: data.get("displayName") };
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "操作失败，请重试");
      router.replace("/" as never); router.refresh();
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "操作失败，请重试"); } finally { setPending(false); }
  }

  return <form className={cn("flex flex-col gap-6", className)} onSubmit={submit}><FieldGroup>
    <div className="flex flex-col items-center gap-1 text-center"><h1 className="text-2xl font-bold">{labels.title}</h1><p className="text-sm text-balance text-muted-foreground">{labels.description}</p></div>
    {mode !== "login" && <Field><FieldLabel htmlFor="displayName">显示名称</FieldLabel><Input id="displayName" name="displayName" autoComplete="name" placeholder="你的名字" required /></Field>}
    {mode === "setup" && <Field><FieldLabel htmlFor="workspaceName">Workspace 名称</FieldLabel><Input id="workspaceName" name="workspaceName" placeholder="例如：Seek 团队" required /></Field>}
    {mode !== "invite" && <Field><FieldLabel htmlFor="email">邮箱</FieldLabel><Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></Field>}
    <Field><div className="flex items-center"><FieldLabel htmlFor="password">密码</FieldLabel>{mode === "login" && <span className="ml-auto text-xs text-muted-foreground">忘记密码功能即将提供</span>}</div><Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={12} required />{mode !== "login" && <FieldDescription>至少 12 个字符。密码只以单向哈希形式保存。</FieldDescription>}</Field>
    {error && <FieldError>{error}</FieldError>}
    <Field><Button type="submit" disabled={pending}>{pending ? "正在处理…" : labels.submit}</Button></Field>
    {mode === "login" && <FieldDescription className="text-center">没有账号？请向 Workspace 管理员索取邀请链接。</FieldDescription>}
  </FieldGroup></form>;
}
