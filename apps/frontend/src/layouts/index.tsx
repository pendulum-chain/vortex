import { FC, ReactNode, useEffect } from "react";
import { Footer } from "../components/Footer";
import { MaintenanceBanner } from "../components/MaintenanceBanner";
import { Navbar } from "../components/Navbar";
import Stepper from "../components/Stepper";
import { useIsQuoteComponentDisplayed } from "../hooks/ramp/useIsQuoteComponentDisplayed";
import { useRampUrlParams } from "../hooks/useRampUrlParams";
import { useStepper } from "../hooks/useStepper";
import { useWidgetMode } from "../hooks/useWidgetMode";
import { useFetchMaintenanceStatus } from "../stores/maintenanceStore";

interface BaseLayoutProps {
  main: ReactNode;
  modals?: ReactNode;
}

export const BaseLayout: FC<BaseLayoutProps> = ({ main, modals }) => {
  const isWidgetMode = useWidgetMode();
  const fetchMaintenanceStatus = useFetchMaintenanceStatus();
  const { steps } = useStepper();
  const isQuoteComponentDisplayed = useIsQuoteComponentDisplayed();

  // Fetch maintenance status when the app loads
  useEffect(() => {
    fetchMaintenanceStatus();

    // Set up periodic refresh every 5 minutes
    const interval = setInterval(
      () => {
        fetchMaintenanceStatus();
      },
      5 * 60 * 1000
    );

    return () => clearInterval(interval);
  }, [fetchMaintenanceStatus]);

  const isStepperHidden = isWidgetMode && isQuoteComponentDisplayed;

  return (
    <>
      {modals}
      <Navbar />
      <MaintenanceBanner />
      {isWidgetMode && (
        <>
          <div className="container relative z-20 mx-auto px-4 pt-6 md:w-120">
            {isStepperHidden ? <div className="h-[54px]" /> : <Stepper className="mb-6" steps={steps} />}
          </div>
          <div className="absolute inset-0 z-0 h-full w-full overflow-hidden">
            <div className="absolute inset-y-0 left-0 z-0 w-1/2 animate-float bg-gradient-to-b from-white via-blue-100 to-white"></div>
            <div className="absolute inset-y-0 right-0 z-0 w-1/2 rotate-180 animate-float-delayed bg-gradient-to-b from-white via-blue-100 to-white"></div>
          </div>
        </>
      )}

      <div className="relative z-30 pb-8">{main}</div>
      {!isWidgetMode && <Footer />}
    </>
  );
};
