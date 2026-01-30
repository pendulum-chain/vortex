import { useTranslation } from "react-i18next";
import blueLogo from "../../assets/logo/blue.svg";
import whiteLogo from "../../assets/logo/white.png";
import { useWidgetMode } from "../../hooks/useWidgetMode";

interface LogoButtonProps {
  onClick: () => void;
}

export const LogoButton = ({ onClick }: LogoButtonProps) => {
  const { t } = useTranslation();
  const isWidgetMode = useWidgetMode();

  return (
    <button className="cursor-pointer" onClick={onClick}>
      <img alt={t("components.navbar.vortexLogo")} className="xs:block max-w-38" src={isWidgetMode ? blueLogo : whiteLogo} />
    </button>
  );
};
