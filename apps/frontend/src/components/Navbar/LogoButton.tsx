import { useTranslation } from "react-i18next";
import blueLogo from "../../assets/logo/blue.svg";
import whiteLogo from "../../assets/logo/white.png";

interface LogoButtonProps {
  onClick: () => void;
  variant?: "blue" | "white";
}

export const LogoButton = ({ onClick, variant = "white" }: LogoButtonProps) => {
  const { t } = useTranslation();

  return (
    <button className="cursor-pointer" onClick={onClick}>
      <img
        alt={t("components.navbar.vortexLogo")}
        className="xs:block max-w-38"
        src={variant === "blue" ? blueLogo : whiteLogo}
      />
    </button>
  );
};
