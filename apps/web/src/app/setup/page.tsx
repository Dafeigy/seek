import { redirect } from "next/navigation";
import { GalleryVerticalEndIcon } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { getCurrentSession, hasInitialOwner } from "@/lib/auth";

export default async function SetupPage() {
  if (await getCurrentSession()) redirect("/");
  if (await hasInitialOwner()) redirect("/login");
  return <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6"><div className="w-full max-w-sm rounded-2xl border bg-card p-7 shadow-sm"><div className="mb-6 flex items-center gap-2 font-medium"><span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><GalleryVerticalEndIcon className="size-4" /></span>Seek</div><LoginForm mode="setup" /></div></main>;
}
