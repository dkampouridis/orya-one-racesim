import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[2px] border font-mono text-[11px] font-medium uppercase tracking-[0.14em] transition duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8002d] disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "border-[#e8002d] bg-[#e8002d] text-white shadow-[2px_2px_0_#8c0018] hover:bg-[#ff1a45] hover:border-[#ff1a45] cursor-crosshair",
        secondary:
          "border-[#2a2a2a] bg-[#0f0f0f] text-[#8a8a8a] hover:border-[#444] hover:text-[#f0f0f0]",
        ghost:
          "border-transparent bg-transparent text-[#8a8a8a] hover:bg-[#141414] hover:text-[#f0f0f0]",
      },
      size: {
        default: "px-4 py-2",
        sm: "px-3 py-1.5 text-[9px]",
        lg: "px-6 py-3 text-[12px]",
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

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
