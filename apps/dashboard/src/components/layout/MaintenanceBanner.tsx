import { TriangleAlert } from "lucide-react";
import { useActiveMaintenance } from "@/hooks/useActiveMaintenance";

export function MaintenanceBanner() {
  const maintenance = useActiveMaintenance();

  if (!maintenance) return null;

  const endsAt = new Date(maintenance.end_datetime).toLocaleString(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZoneName: "short"
  });

  return (
    <div className="flex min-w-0 items-start gap-2 bg-warning px-4 py-2 text-sm text-warning-foreground" role="status">
      <TriangleAlert className="mt-px size-4 shrink-0" />
      <div className="min-w-0">
        <p>
          <strong>{maintenance.title}</strong> · {maintenance.message}
        </p>
        <p className="font-medium text-xs">New transfers and payment confirmations are paused until {endsAt}.</p>
      </div>
    </div>
  );
}
