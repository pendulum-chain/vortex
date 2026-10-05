import { apiClient } from "./api-client";

// Mirrors GET /v1/maintenance/status (apps/api/src/api/services/maintenance.service.ts).
export interface MaintenanceDetails {
  title: string;
  message: string;
  start_datetime: string;
  end_datetime: string;
}

interface MaintenanceStatusResponse {
  is_maintenance_active: boolean;
  maintenance_details: MaintenanceDetails | null;
}

export const MaintenanceService = {
  getStatus: () => apiClient.get<MaintenanceStatusResponse>("/maintenance/status")
};
