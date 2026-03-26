import { ChevronDownIcon } from "@heroicons/react/24/solid";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useId } from "react";
import { cn } from "../../helpers/cn";

interface DropdownSelectorProps {
  label?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerContent: ReactNode;
  children: ReactNode;
  isLoading?: boolean;
  className?: string;
}

export function DropdownSelector({
  label,
  open,
  onOpenChange,
  triggerContent,
  children,
  isLoading,
  className
}: DropdownSelectorProps) {
  const prefersReducedMotion = useReducedMotion();
  const labelId = useId();

  function handleBlur(e: React.FocusEvent) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      onOpenChange(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onOpenChange(false);
    }
  }

  const dropdownVariants = prefersReducedMotion
    ? { animate: {}, exit: {}, initial: {} }
    : {
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
        initial: { opacity: 0, y: -4 }
      };

  return (
    <div
      aria-labelledby={label ? labelId : undefined}
      className={cn("flex flex-col", className)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      role="group"
    >
      {label && (
        <p className="mb-2 font-medium text-gray-700 text-sm" id={labelId}>
          {label}
        </p>
      )}

      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex min-h-[44px] w-full cursor-pointer touch-manipulation items-center gap-3 rounded-xl border border-base-300 bg-base-200 px-3 py-2.5 text-left transition-colors active:scale-[0.98]",
          "[@media(hover:hover)]:hover:border-gray-300 [@media(hover:hover)]:hover:bg-neutral"
        )}
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        {isLoading ? (
          <div className="h-6 w-full animate-pulse rounded-lg bg-gray-100" />
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{triggerContent}</div>
        )}
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: "easeInOut" }}
        >
          <ChevronDownIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-secondary-content" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            {...dropdownVariants}
            className="mt-1 overflow-hidden rounded-xl border border-base-300 bg-base-200 shadow-sm"
            role="listbox"
            transition={{ duration: 0.15, ease: [0.215, 0.61, 0.355, 1] }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
