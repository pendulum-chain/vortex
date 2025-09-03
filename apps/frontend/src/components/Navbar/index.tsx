import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import whiteMobileLogo from "../../assets/logo/circle.png";
import whiteLogo from "../../assets/logo/white.png";
import { useRampActor } from "../../contexts/rampState";
import { cn } from "../../helpers/cn";

interface SubmenuItem {
  label: string;
  onClick: () => void;
}

export const Navbar = () => {
  const rampActor = useRampActor();
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Event handlers
  const handleLogoClick = () => {
    // Reset the ramp state and go back to the home page
    const cleanUrl = window.location.origin;
    window.history.replaceState({}, "", cleanUrl);
    rampActor.send({ type: "RESET_RAMP" });
  };

  const handleAPIClick = () => {
    window.open("https://api-docs.vortexfinance.co/", "_blank");
  };

  const handleWidgetClick = () => {
    // TODO: Define widget click handling later
    console.log("Widget clicked - handler to be implemented");
  };

  const handleDocsClick = () => {
    window.open("https://pendulum.gitbook.io/vortex", "_blank");
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const submenuItems: SubmenuItem[] = [
    { label: "Widget", onClick: handleWidgetClick },
    { label: "API", onClick: handleAPIClick }
  ];

  const navLinkStyles = "text-white text-xl";
  const submenuButtonStyles =
    "block w-full cursor-pointer px-4 py-2 text-left text-gray-800 transition-colors hover:bg-gray-100";
  const mobileMenuItemStyles = "block w-full text-left px-2 py-2 text-white text-xl hover:bg-blue-800 transition-colors";

  const LogoButton = () => (
    <button className="cursor-pointer" onClick={handleLogoClick}>
      <img alt="Vortex Logo" className="xs:block max-w-38" src={whiteLogo} />
    </button>
  );

  const SolutionsDropdown = () => (
    <div className="relative ml-3" onMouseEnter={() => setIsSubmenuOpen(true)} onMouseLeave={() => setIsSubmenuOpen(false)}>
      <div className={`cursor-pointer ${navLinkStyles}`}>Solutions</div>
      {isSubmenuOpen && (
        <div className="absolute top-full left-0 z-50 cursor-initial pt-2">
          <div className="min-w-24 rounded-lg bg-white py-2 shadow-lg">
            {submenuItems.map(item => (
              <button className={submenuButtonStyles} key={item.label} onClick={item.onClick}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const HamburgerButton = () => (
    <button
      aria-label="Toggle mobile menu"
      className={`flex h-8 w-8 flex-col items-center justify-center rounded-md transition-colors duration-200 sm:hidden ${
        isMobileMenuOpen ? "bg-white" : "btn-vortex-secondary"
      }`}
      onClick={toggleMobileMenu}
    >
      <span className={`block h-0.5 w-5 transition-colors duration-200 ${isMobileMenuOpen ? "bg-blue-950" : "bg-white"}`} />
      <span
        className={`mt-1 block h-0.5 w-5 transition-colors duration-200 ${isMobileMenuOpen ? "bg-blue-950" : "bg-white"}`}
      />
      <span
        className={`mt-1 block h-0.5 w-5 transition-colors duration-200 ${isMobileMenuOpen ? "bg-blue-950" : "bg-white"}`}
      />
    </button>
  );

  const MobileMenu = () => (
    <AnimatePresence>
      {isMobileMenuOpen && (
        <motion.div
          animate={{ height: "auto", opacity: 1 }}
          className="fixed top-[64px] right-0 left-0 z-40 overflow-hidden bg-blue-950 shadow-lg sm:hidden"
          exit={{ height: 0, opacity: 0 }}
          initial={{ height: 0, opacity: 0 }}
          key="mobile-menu"
          transition={{
            duration: 0.4,
            ease: "easeInOut"
          }}
        >
          <motion.div
            animate={{ y: 0 }}
            className="flex flex-col px-6 py-4"
            exit={{ y: -20 }}
            initial={{ y: -20 }}
            transition={{
              duration: 0.2,
              ease: "easeOut"
            }}
          >
            {/* Menu content */}
            <div className="mb-6">
              <div className={mobileMenuItemStyles}>Solutions</div>
              <div className="space-y-2">
                {submenuItems.map((item, index) => (
                  <motion.button
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(mobileMenuItemStyles, "ml-4")}
                    exit={{ opacity: 0, x: -20 }}
                    initial={{ opacity: 0, x: -20 }}
                    key={item.label}
                    onClick={() => {
                      item.onClick();
                      setIsMobileMenuOpen(false);
                    }}
                    transition={{
                      delay: 0.1 + index * 0.1,
                      duration: 0.2,
                      ease: "easeOut"
                    }}
                  >
                    {item.label}
                  </motion.button>
                ))}
              </div>
            </div>
            <motion.button
              animate={{ opacity: 1, x: 0 }}
              className={mobileMenuItemStyles}
              exit={{ opacity: 0, x: -20 }}
              initial={{ opacity: 0, x: -20 }}
              onClick={() => {
                handleDocsClick();
                setIsMobileMenuOpen(false);
              }}
              transition={{
                delay: 0.3,
                duration: 0.2,
                ease: "easeOut"
              }}
            >
              Docs
            </motion.button>
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 mb-4"
              exit={{ opacity: 0, y: 20 }}
              initial={{ opacity: 0, y: 20 }}
              transition={{
                delay: 0.4,
                duration: 0.2,
                ease: "easeOut"
              }}
            >
              <button className="btn btn-vortex-secondary w-full rounded-3xl">Book demo</button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

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
          <div className="hidden grow items-center gap-8 sm:flex">
            <LogoButton />
            <SolutionsDropdown />
            <a className={`ml-3 ${navLinkStyles}`} href="https://pendulum.gitbook.io/vortex" target="_blank">
              Docs
            </a>
          </div>

          {/* Mobile Navigation */}
          <div className="flex grow items-center justify-between sm:hidden">
            <LogoButton />
            <HamburgerButton />
          </div>

          {/* Desktop Actions */}
          <div className="hidden items-center sm:flex">
            <button className="btn btn-vortex-secondary rounded-3xl">Book demo</button>
          </div>
        </div>
      </motion.header>

      <MobileMenu />
    </>
  );
};
