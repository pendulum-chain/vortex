import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { cn } from "../../helpers/cn";
import { useWidgetMode } from "../../hooks/useWidgetMode";
import { useNavbarHandlers } from "./hooks/useNavbarHandlers";
import { LogoButton } from "./LogoButton";

export const DesktopNavbar = () => {
  const { t } = useTranslation();
  const isWidgetMode = useWidgetMode();
  const { resetRampAndNavigateHome } = useNavbarHandlers();
  const params = useParams({ strict: false });
  const routerState = useRouterState();

  const isBusinessPage = routerState.location.pathname.includes("/business");
  const useTransparentStyle = isWidgetMode || isBusinessPage;

  return (
    <div className={cn("relative px-4 py-4 md:px-10 md:py-5", useTransparentStyle ? "bg-transparent" : "bg-blue-950")}>
      <div className="mx-6 flex items-center justify-between sm:container sm:mx-auto">
        {isWidgetMode ? (
          <LogoButton onClick={resetRampAndNavigateHome} variant="blue" />
        ) : (
          <>
            <div className="group flex grow items-center gap-10">
              <LogoButton onClick={resetRampAndNavigateHome} variant={isBusinessPage ? "blue" : "white"} />
              <Link
                activeProps={{
                  className: cn(
                    "transition-colors group-hover:[&:not(:hover)]:text-gray-400",
                    isBusinessPage ? "text-blue-950 hover:text-blue-950" : "text-white hover:text-white"
                  )
                }}
                className={cn(
                  "text-xl transition-colors",
                  isBusinessPage ? "text-gray-600 hover:text-blue-950" : "text-gray-400 hover:text-white"
                )}
                params={params}
                to="/{-$locale}"
              >
                {t("components.navbar.individuals")}
              </Link>
              <Link
                activeProps={{
                  className: cn(
                    "transition-colors group-hover:[&:not(:hover)]:text-gray-400",
                    isBusinessPage ? "text-blue-950 hover:text-blue-950" : "text-white hover:text-white"
                  )
                }}
                className={cn(
                  "text-xl transition-colors",
                  isBusinessPage ? "text-gray-600 hover:text-blue-950" : "text-gray-400 hover:text-white"
                )}
                params={params}
                to="/{-$locale}/business"
              >
                {t("components.navbar.business")}
              </Link>
            </div>

            <div className="flex items-center">
              <Link className="btn btn-vortex-secondary rounded-3xl" to="/{-$locale}/widget">
                Buy & Sell
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
