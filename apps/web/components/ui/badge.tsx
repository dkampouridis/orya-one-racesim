import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[2px] border px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.18em] whitespace-nowrap",
  {
    variants: {
      variant: {
        /* ATTACK — red fill */
        default: "border-[#e8002d] bg-[#e8002d] text-white",
        /* STABLE — green text, transparent bg */
        success: "border-[#00d2a0] bg-transparent text-[#00d2a0]",
        /* CAUTION — amber */
        warning: "border-[#f5a623] bg-transparent text-[#f5a623]",
        /* EXPOSED — white dashed */
        muted: "border-[#444444] bg-transparent text-[#8a8a8a]",
        /* INFO — cyan */
        info: "border-[#4fc3f7] bg-transparent text-[#4fc3f7]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}
