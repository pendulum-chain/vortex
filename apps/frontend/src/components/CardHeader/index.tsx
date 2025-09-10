import { useHamburgerMenuActions, useHamburgerMenuState } from "../../stores/hamburgerMenuStore";
import { HamburgerMenu } from "../HamburgerMenu";
import { HamburgerIcon } from "../HamburgerMenu/HamburgerIcon";

interface CardHeaderProps {
  title?: string;
  className?: string;
  children?: React.ReactNode;
}

export const CardHeader = ({ title, className, children }: CardHeaderProps) => {
  const isMenuOpen = useHamburgerMenuState();
  const { toggleMenu } = useHamburgerMenuActions();

  return (
    <div className={`${className || ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1 text-center">
          {title && <h1 className="font-bold text-3xl text-blue-700">{title}</h1>}
          {children}
        </div>

        <div className="absolute top-1 right-1 z-50">
          <HamburgerIcon isOpen={isMenuOpen} onClick={toggleMenu} />
        </div>
      </div>

      <HamburgerMenu />
    </div>
  );
};
