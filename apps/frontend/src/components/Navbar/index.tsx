import { motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWidgetMode } from "../../hooks/useWidgetMode";
import { HamburgerButton } from "./HamburgerButton";
import { useNavbarHandlers } from "./hooks/useNavbarHandlers";
import { LogoButton } from "./LogoButton";
import { MobileMenu } from "./MobileMenu";
import { SolutionsDropdown } from "./SolutionsDropdown";
import { SubmenuItem } from "./types";

export const Navbar = () => {
  const { t } = useTranslation();
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isWidgetMode = useWidgetMode();

  const { handleLogoClick, handleBookDemoClick, handleAPIClick, handleWidgetClick, handleDocsClick } = useNavbarHandlers();

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const submenuItems: SubmenuItem[] = [
    { label: t("components.navbar.widget"), onClick: handleWidgetClick },
    { label: t("components.navbar.api"), onClick: handleAPIClick }
  ];

  const navLinkStyles = "text-white text-xl";

  return (
    <>
      <motion.header
        animate={{ y: 0 }}
        className="relative flex items-center justify-center bg-blue-950 px-4 py-4 md:px-10 md:py-5"
        exit={{ y: -10 }}
        initial={{ y: 0 }}
        key="navbar-header"
        transition={{
          duration: 0.5,
          ease: "easeInOut"
        }}
      >
        <div className="flex w-full max-w-4xl grow-1 justify-between">
          {isWidgetMode ? (
            <LogoButton onClick={handleLogoClick} />
          ) : (
            <>
              {/* Desktop Navigation */}
              <div className="hidden grow items-center gap-8 sm:flex">
                <LogoButton onClick={handleLogoClick} />
                <SolutionsDropdown
                  isOpen={isSubmenuOpen}
                  onMouseEnter={() => setIsSubmenuOpen(true)}
                  onMouseLeave={() => setIsSubmenuOpen(false)}
                  submenuItems={submenuItems}
                />
                <a className={`ml-3 ${navLinkStyles}`} href="https://pendulum.gitbook.io/vortex" target="_blank">
                  {t("components.navbar.docs")}
                </a>
              </div>

              {/* Mobile Navigation */}
              <div className="flex grow items-center justify-between sm:hidden">
                <LogoButton onClick={handleLogoClick} />
                <HamburgerButton isOpen={isMobileMenuOpen} onClick={toggleMobileMenu} />
              </div>

              {/* Desktop Actions */}
              <div className="hidden items-center sm:flex">
                <button className="btn btn-vortex-secondary rounded-3xl" onClick={handleBookDemoClick}>
                  {t("components.navbar.bookDemo")}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.header>

      <MobileMenu
        isOpen={isMobileMenuOpen}
        onBookDemoClick={handleBookDemoClick}
        onDocsClick={handleDocsClick}
        onMenuItemClick={closeMobileMenu}
        submenuItems={submenuItems}
      />
    </>
  );
};
