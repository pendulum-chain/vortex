import { useQuery } from "@tanstack/react-query";
import {
  type MaintenanceDetails,
  MaintenanceService,
  type MaintenanceStatusResponse
} from "@/services/api/maintenance.service";

export const MAINTENANCE_QUOTE_ERROR = "Quotes are paused for scheduled maintenance. Try again once it ends.";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
// Slack after end_datetime so the refetch lands once the API has stopped rejecting.
const END_BUFFER_MS = 15_000;

/** Poll every 5 minutes, but refetch just after an active window ends so actions unlock promptly. */
export function maintenanceRefetchInterval(status: MaintenanceStatusResponse | undefined, now: number): number {
  const endsAt = status?.is_maintenance_active ? Date.parse(status.maintenance_details?.end_datetime ?? "") : Number.NaN;
  return Number.isNaN(endsAt) ? POLL_INTERVAL_MS : Math.min(POLL_INTERVAL_MS, Math.max(endsAt - now, 0) + END_BUFFER_MS);
}

/** The active maintenance window, or null. The API rejects quotes and ramp mutations while one is active. */
export function useActiveMaintenance(): MaintenanceDetails | null {
  const { data } = useQuery({
    queryFn: MaintenanceService.getStatus,
    queryKey: ["maintenance-status"],
    refetchInterval: query => maintenanceRefetchInterval(query.state.data, Date.now()),
    refetchOnWindowFocus: true
  });

  return data?.is_maintenance_active ? data.maintenance_details : null;
}
