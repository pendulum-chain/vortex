import { useQuery } from "@tanstack/react-query";
import { type MaintenanceDetails, MaintenanceService } from "@/services/api/maintenance.service";

/** The active maintenance window, or null. The API rejects quotes and ramp mutations while one is active. */
export function useActiveMaintenance(): MaintenanceDetails | null {
  const { data } = useQuery({
    queryFn: MaintenanceService.getStatus,
    queryKey: ["maintenance-status"],
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true
  });

  return data?.is_maintenance_active ? data.maintenance_details : null;
}
