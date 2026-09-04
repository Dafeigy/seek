import { redirect } from "next/navigation";
import { GalleryVerticalEndIcon } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { getCurrentSession, hasInitialOwner } from "@/lib/auth";

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/");
  if (!(await hasInitialOwner())) redirect("/setup");
  return <main className="grid min-h-svh lg:grid-cols-2"><section className="flex flex-col gap-4 p-6 md:p-10"><div className="flex justify-center gap-2 md:justify-start"><div className="flex items-center gap-2 font-medium"><span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><GalleryVerticalEndIcon className="size-4" /></span>Seek</div></div><div className="flex flex-1 items-center justify-center"><div className="w-full max-w-sm"><LoginForm /></div></div></section><aside className="relative hidden bg-muted lg:block"><div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--primary),transparent_55%)] opacity-15" /><div className="absolute inset-0 flex items-end p-12 text-4xl font-semibold tracking-tight text-foreground/70">把团队知识<br />留在团队里。</div></aside></main>;
}
