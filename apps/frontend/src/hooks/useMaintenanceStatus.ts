import { useEffect } from "react";
import { useFetchMaintenanceStatus } from "../stores/maintenanceStore";

export function useMaintenanceStatus() {
  const fetchMaintenanceStatus = useFetchMaintenanceStatus();

  useEffect(() => {
    fetchMaintenanceStatus();

    const interval = setInterval(
      () => {
        fetchMaintenanceStatus();
      },
      5 * 60 * 1000
    );

    return () => clearInterval(interval);
  }, [fetchMaintenanceStatus]);
}
