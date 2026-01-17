import { AnimatePresence } from "motion/react";
import { useRef, useState } from "react";
import { cn } from "../../helpers/cn";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useWidgetMode } from "../../hooks/useWidgetMode";
import { HamburgerButton } from "./HamburgerButton";
import { useNavbarHandlers } from "./hooks/useNavbarHandlers";
import { LogoButton } from "./LogoButton";
import { MobileMenu } from "./MobileMenu";

export const MobileNavbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isWidgetMode = useWidgetMode();
  const navbarRef = useRef<HTMLDivElement>(null);

  const { resetRampAndNavigateHome } = useNavbarHandlers();

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  useClickOutside(navbarRef, closeMobileMenu, isMobileMenuOpen);

  return (
    <div className="relative" ref={navbarRef}>
      <div className={cn("relative z-20 px-4 py-4", isWidgetMode ? "bg-transparent" : "bg-blue-950")}>
        <div className="flex items-center justify-between">
          {isWidgetMode ? (
            <LogoButton onClick={resetRampAndNavigateHome} />
          ) : (
            <div className="flex grow items-center justify-between">
              <LogoButton onClick={resetRampAndNavigateHome} />
              <HamburgerButton isOpen={isMobileMenuOpen} onClick={toggleMobileMenu} />
            </div>
          )}
        </div>
      </div>
      <AnimatePresence mode="wait">{isMobileMenuOpen && <MobileMenu onMenuItemClick={closeMobileMenu} />}</AnimatePresence>
    </div>
  );
};
