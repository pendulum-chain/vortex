import { FC, ReactNode, useEffect } from "react";
import { Footer } from "../components/Footer";
import { MaintenanceBanner } from "../components/MaintenanceBanner";
import { Navbar } from "../components/Navbar";
import Stepper from "../components/Stepper";
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

  return (
    <>
      {modals}
      <Navbar />
      <MaintenanceBanner />
      {isWidgetMode && (
        <div className="container mx-auto px-4 pt-6 md:w-120">{/* <Stepper className="mb-6" steps={steps} /> */}</div>
      )}
      <div className="absolute top-1/8 right-0 z-10 h-[80vh] w-full bg-gradient-to-b from-white via-blue-100 to-white px-4 pt-6"></div>
      <div className="relative z-30">{main}</div>
      {!isWidgetMode && <Footer />}
    </>
  );
};
