import { FC } from 'react';
import { useIsMaintenanceActive, useMaintenanceDetails } from '../../stores/maintenanceStore';

export const MaintenanceBanner: FC = () => {
  const isMaintenanceActive = useIsMaintenanceActive();
  const maintenanceDetails = useMaintenanceDetails();

  if (!isMaintenanceActive || !maintenanceDetails) {
    return null;
  }

  const formatDateTime = (dateTimeString: string) => {
    try {
      const date = new Date(dateTimeString);
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    } catch {
      return dateTimeString;
    }
  };

  const formatTimeRemaining = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="bg-warning text-warning-content px-4 py-3 shadow-md">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 mt-0.5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{maintenanceDetails.title}</div>
            <div className="mt-1 text-sm opacity-90">{maintenanceDetails.message}</div>
            <div className="mt-2 text-xs opacity-75 space-y-1">
              <div>
                <span className="font-medium">Started:</span> {formatDateTime(maintenanceDetails.start_datetime)}
              </div>
              <div>
                <span className="font-medium">Expected end:</span> {formatDateTime(maintenanceDetails.end_datetime)}
              </div>
              {maintenanceDetails.estimated_time_remaining_seconds &&
                maintenanceDetails.estimated_time_remaining_seconds > 0 && (
                  <div>
                    <span className="font-medium">Estimated time remaining:</span>{' '}
                    {formatTimeRemaining(maintenanceDetails.estimated_time_remaining_seconds)}
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
