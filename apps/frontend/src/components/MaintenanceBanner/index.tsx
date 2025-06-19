import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useIsMaintenanceActive, useMaintenanceDetails } from "../../stores/maintenanceStore";

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
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        timeZoneName: "short",
        year: "numeric"
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
      <div className="mx-auto max-w-2xl">
        <div className="rounded-lg border border-orange-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 sm:h-8 sm:w-8">
                <ExclamationTriangleIcon className="h-4 w-4 fill-amber-500 sm:h-5 sm:w-5" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-900 text-sm sm:text-base">{maintenanceDetails.title}</div>
              <div className="mt-1 text-gray-700 text-xs sm:text-sm">{maintenanceDetails.message}</div>
              <div className="mt-2 space-y-1 text-gray-600 text-xs sm:mt-3">
                <div className="flex flex-col space-y-1 sm:flex-row sm:space-x-4 sm:space-y-0">
                  <div>
                    <span className="font-medium">{t("components.maintenance.banner.started")}:</span>{" "}
                    {formatDateTime(maintenanceDetails.start_datetime)}
                  </div>
                  <div>
                    <span className="font-medium">{t("components.maintenance.banner.ends")}:</span>{" "}
                    {formatDateTime(maintenanceDetails.end_datetime)}
                  </div>
                </div>
                {maintenanceDetails.estimated_time_remaining_seconds &&
                  maintenanceDetails.estimated_time_remaining_seconds > 0 && (
                    <div>
                      <span className="font-medium">{t("components.maintenance.banner.estimatedTimeRemaining")}:</span>{" "}
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
