import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-medium transition-[color,background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29C16A]/45 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[#1b211d] text-white shadow-sm hover:bg-[#26322a]",
        secondary: "bg-[#eaf9f0] text-[#117c40] hover:bg-[#dff5e7]",
        ghost: "text-[#66716a] hover:bg-black/[.045] hover:text-[#172019]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, children, ...props }: ButtonProps) {
  const classNames = cn(buttonVariants({ variant, size, className }));
  if (asChild) {
    return React.cloneElement(children as React.ReactElement<{ className?: string }>, { className: classNames });
  }
  return <button className={classNames} {...props}>{children}</button>;
}
