import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsMaintenanceActive, useMaintenanceDetails } from '../../stores/maintenanceStore';

export const MaintenanceBanner: FC = () => {
  const { t } = useTranslation();

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
    <div className="px-4 pt-3">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white border border-orange-200 rounded-lg shadow-sm p-3 sm:p-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-orange-100 rounded-full flex items-center justify-center">
                <ExclamationTriangleIcon className="h-4 w-4 sm:h-5 sm:w-5 fill-amber-500" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm sm:text-base font-semibold text-gray-900">{maintenanceDetails.title}</div>
              <div className="mt-1 text-xs sm:text-sm text-gray-700">{maintenanceDetails.message}</div>
              <div className="mt-2 sm:mt-3 text-xs text-gray-600 space-y-1">
                <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-1 sm:space-y-0">
                  <div>
                    <span className="font-medium">{t('components.maintenance.banner.started')}:</span>{' '}
                    {formatDateTime(maintenanceDetails.start_datetime)}
                  </div>
                  <div>
                    <span className="font-medium">{t('components.maintenance.banner.ends')}:</span>{' '}
                    {formatDateTime(maintenanceDetails.end_datetime)}
                  </div>
                </div>
                {maintenanceDetails.estimated_time_remaining_seconds &&
                  maintenanceDetails.estimated_time_remaining_seconds > 0 && (
                    <div>
                      <span className="font-medium">{t('components.maintenance.banner.estimatedTimeRemaining')}:</span>{' '}
                      {formatTimeRemaining(maintenanceDetails.estimated_time_remaining_seconds)}
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
