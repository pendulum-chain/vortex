import { useTranslation } from "react-i18next";
import whiteLogo from "../../assets/logo/white.png";

interface LogoButtonProps {
  onClick: () => void;
}

export const LogoButton = ({ onClick }: LogoButtonProps) => {
  const { t } = useTranslation();

  return (
    <button className="cursor-pointer" onClick={onClick}>
      <img alt={t("components.navbar.vortexLogo")} className="xs:block max-w-38" src={whiteLogo} />
    </button>
  );
};
