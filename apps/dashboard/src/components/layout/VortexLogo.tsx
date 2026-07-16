import { cn } from "@/lib/cn";

export function VortexLogo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
        V
      </span>
      {showWordmark && (
        <div className="grid leading-tight">
          <span className="font-semibold text-sidebar-foreground text-sm">Vortex</span>
          <span className="text-muted-foreground text-xs">Dashboard</span>
        </div>
      )}
    </div>
  );
}
