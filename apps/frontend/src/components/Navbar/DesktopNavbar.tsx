import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useWidgetMode } from "../../hooks/useWidgetMode";
import { useNavbarHandlers } from "./hooks/useNavbarHandlers";
import { LogoButton } from "./LogoButton";

export const DesktopNavbar = () => {
  const { t } = useTranslation();
  const isWidgetMode = useWidgetMode();
  const { resetRampAndNavigateHome } = useNavbarHandlers();
  const params = useParams({ strict: false });

  return (
    <div className="relative bg-blue-950 px-4 py-4 md:px-10 md:py-5">
      <div className="mx-6 flex items-center justify-between sm:container sm:mx-auto">
        {isWidgetMode ? (
          <LogoButton onClick={resetRampAndNavigateHome} />
        ) : (
          <>
            <div className="group flex grow items-center gap-10">
              <LogoButton onClick={resetRampAndNavigateHome} />
              <Link
                activeProps={{
                  className: "text-white transition-colors hover:text-white group-hover:[&:not(:hover)]:text-gray-400"
                }}
                className="text-gray-400 text-xl transition-colors hover:text-white"
                params={params}
                to="/{-$locale}"
              >
                {t("components.navbar.individuals")}
              </Link>
              <Link
                activeProps={{
                  className: "text-white transition-colors hover:text-white group-hover:[&:not(:hover)]:text-gray-400"
                }}
                className="text-gray-400 text-xl transition-colors hover:text-white"
                params={params}
                to="/{-$locale}/business"
              >
                {t("components.navbar.business")}
              </Link>
            </div>

            <div className="flex items-center">
              <button
                className="btn btn-vortex-secondary "
                onClick={() => {
                  console.log("book demo");
                }}
              >
                Buy & Sell
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
