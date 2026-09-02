"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Monitor, Moon, Settings2, Sun, X } from "lucide-react";

import { useTheme, type Theme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: Array<{
  value: Theme;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Light", description: "始终使用浅色外观", icon: Sun },
  { value: "dark", label: "Dark", description: "始终使用深色外观", icon: Moon },
  { value: "system", label: "Auto", description: "跟随系统外观设置", icon: Monitor },
];

export function SettingsDialog({ compact }: { compact: boolean }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
        title={compact ? "设置" : undefined}
        aria-haspopup="dialog"
        className={cn(
          "h-9 w-full text-[13px] font-normal text-muted",
          compact ? "px-0" : "justify-start gap-2.5 px-3",
        )}
      >
        <Settings2 className="size-4" />
        {!compact && "设置"}
      </Button>

      {open && (
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          onCancel={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          className="fixed inset-0 m-auto max-h-[min(720px,calc(100vh-2rem))] w-[min(720px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card p-0 text-left text-ink shadow-2xl backdrop:bg-black/55 backdrop:backdrop-blur-[2px]"
        >
          <div className="flex h-16 items-center border-b border-border px-5">
            <div>
              <h2 id={titleId} className="text-base font-semibold tracking-tight">设置</h2>
              <p className="mt-0.5 text-xs text-soft">管理 Seek 的偏好设置</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              className="ml-auto size-8 text-soft"
              aria-label="关闭设置"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid min-h-[390px] sm:grid-cols-[168px_minmax(0,1fr)]">
            <nav aria-label="设置分类" className="border-b border-border bg-muted/30 p-3 sm:border-b-0 sm:border-r">
              <Button type="button" variant="secondary" className="h-9 w-full justify-start px-3 text-[13px]">
                <Sun className="size-4" />外观
              </Button>
            </nav>

            <section aria-labelledby={`${titleId}-appearance`} className="p-5 sm:p-7">
              <h3 id={`${titleId}-appearance`} className="text-sm font-semibold">外观</h3>
              <p className="mt-1 text-xs leading-5 text-soft">选择最适合你的界面主题。更改会立即应用到页面和编辑器。</p>

              <div role="radiogroup" aria-label="主题" className="mt-6 grid gap-3 sm:grid-cols-3">
                {THEME_OPTIONS.map((option) => {
                  const selected = theme === option.value;
                  const Icon = option.icon;
                  return (
                    <Button
                      key={option.value}
                      type="button"
                      variant="outline"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setTheme(option.value)}
                      className={cn(
                        "relative h-auto min-h-36 flex-col items-stretch justify-start gap-3 rounded-xl p-3 text-left font-normal",
                        selected && "border-ring bg-accent ring-2 ring-ring/25",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-16 items-center justify-center rounded-lg border",
                          option.value === "light" && "border-black/10 bg-white text-neutral-700",
                          option.value === "dark" && "border-white/10 bg-[#202020] text-neutral-200",
                          option.value === "system" && "border-border bg-[linear-gradient(135deg,#fff_0_49.5%,#202020_50%_100%)] text-neutral-500",
                        )}
                      >
                        <Icon className="size-5" />
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{option.label}</span>
                        {selected && <Check className="ml-auto size-4" />}
                      </span>
                      <span className="text-[11px] leading-4 text-muted-foreground">{option.description}</span>
                    </Button>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="flex items-center justify-end border-t border-border px-5 py-3">
            <Button type="button" onClick={() => setOpen(false)} size="sm">完成</Button>
          </div>
        </dialog>
      )}
    </>
  );
}
