import { apiRequest } from './api-client';

export interface MaintenanceDetails {
  title: string;
  message: string;
  start_datetime: string;
  end_datetime: string;
  estimated_time_remaining_seconds?: number;
}

export interface MaintenanceStatusResponse {
  is_maintenance_active: boolean;
  maintenance_details: MaintenanceDetails | null;
}

/**
 * Fetch the current maintenance status from the backend
 * @returns Promise<MaintenanceStatusResponse>
 */
export const getMaintenanceStatus = async (): Promise<MaintenanceStatusResponse> => {
  return apiRequest<MaintenanceStatusResponse>('get', '/maintenance/status');
};
