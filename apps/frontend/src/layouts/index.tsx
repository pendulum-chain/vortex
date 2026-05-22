import { FC, lazy, ReactNode, Suspense } from "react";
import { Footer } from "../components/Footer";
import { MaintenanceBanner } from "../components/MaintenanceBanner";
import { Navbar } from "../components/Navbar";
import { useWidgetMode } from "../hooks/useWidgetMode";
import { useFetchMaintenanceStatus } from "../stores/maintenanceStore";

interface BaseLayoutProps {
  main: ReactNode;
  modals?: ReactNode;
}

const WidgetChrome = lazy(() => import("./WidgetChrome"));

export const BaseLayout: FC<BaseLayoutProps> = ({ main, modals }) => {
  const isWidgetMode = useWidgetMode();

  useFetchMaintenanceStatus();

  return (
    <>
      {modals}
      <Navbar />
      <MaintenanceBanner />
      {isWidgetMode && (
        <Suspense fallback={null}>
          <WidgetChrome />
        </Suspense>
      )}

      <div className="relative z-30 pb-8">{main}</div>
      {!isWidgetMode && <Footer />}
    </>
  );
};
