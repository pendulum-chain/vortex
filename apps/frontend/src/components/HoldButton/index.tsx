import { useCallback, useRef, useState } from "react";
import { cn } from "../../helpers/cn";

interface HoldButtonProps {
  children: React.ReactNode;
  onComplete: () => void;
  onHoldStart?: () => Promise<boolean> | boolean;
  duration?: number;
  disabled?: boolean;
  error?: boolean;
  className?: string;
  holdClassName?: string;
}

export function HoldButton({
  children,
  onComplete,
  onHoldStart,
  duration = 2000,
  disabled = false,
  error = false,
  className,
  holdClassName
}: HoldButtonProps) {
  const [isHolding, setIsHolding] = useState(false);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = useCallback(async () => {
    if (disabled) return;

    if (onHoldStart) {
      const canProceed = await onHoldStart();
      if (!canProceed) return;
    }

    setIsHolding(true);
    holdTimeoutRef.current = setTimeout(() => {
      setIsHolding(false);
      onComplete();
    }, duration);
  }, [disabled, onHoldStart, onComplete, duration]);

  const handlePointerUp = useCallback(() => {
    setIsHolding(false);
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  }, []);

  return (
    <button
      className={cn(
        "relative flex h-12 w-full cursor-pointer select-none items-center justify-center gap-2 overflow-hidden rounded-lg bg-blue-100 font-medium text-gray-500 transition-transform duration-150 ease-out active:scale-[0.98]",
        error && "ring-2 ring-red-800",
        disabled && "cursor-not-allowed bg-gray-100 text-gray-300",
        className
      )}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerUp}
      onPointerUp={handlePointerUp}
      type="button"
    >
      {children}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-lg transition-[clip-path]",
          holdClassName
        )}
        style={{
          clipPath: isHolding ? "inset(0px 0px 0px 0px)" : "inset(0px 100% 0px 0px)",
          transitionDuration: isHolding ? `${duration}ms` : "150ms",
          transitionTimingFunction: isHolding ? "linear" : "ease-out"
        }}
      >
        {children}
      </div>
    </button>
  );
}
