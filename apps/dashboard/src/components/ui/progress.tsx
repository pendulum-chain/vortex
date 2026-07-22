import { motion } from "motion/react";
import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/cn";

function Progress({
  className,
  indicatorClassName,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  return (
    <ProgressPrimitive.Root
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/20", className)}
      data-slot="progress"
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator asChild data-slot="progress-indicator">
        <motion.div
          animate={{ x: `-${100 - (value || 0)}%` }}
          className={cn("h-full w-full flex-1 bg-primary", indicatorClassName)}
          initial={{ x: "-100%" }}
          transition={{ bounce: 0, duration: 0.9, type: "spring" }}
        />
      </ProgressPrimitive.Indicator>
    </ProgressPrimitive.Root>
  );
}

export { Progress };
