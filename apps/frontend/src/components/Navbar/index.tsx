import { motion } from "motion/react";
import { useState } from "react";

import whiteMobileLogo from "../../assets/logo/circle.png";
import whiteLogo from "../../assets/logo/white.png";
import { useRampActor } from "../../contexts/rampState";

interface SubmenuItem {
  label: string;
  onClick: () => void;
}

export const Navbar = () => {
  const rampActor = useRampActor();
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);

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

  const submenuItems: SubmenuItem[] = [
    { label: "Widget", onClick: handleWidgetClick },
    { label: "API", onClick: handleAPIClick }
  ];

  const navLinkStyles = "text-white text-xl";
  const submenuButtonStyles =
    "block w-full cursor-pointer px-4 py-2 text-left text-gray-800 transition-colors hover:bg-gray-100";

  const LogoButton = () => (
    <button className="cursor-pointer" onClick={handleLogoClick}>
      <img alt="Vortex Logo" className="hidden max-w-38 sm:block" src={whiteLogo} />
      <img alt="Vortex Logo" className="block max-w-12 sm:hidden" src={whiteMobileLogo} />
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

  return (
    <motion.header
      animate={{ y: 0 }}
      className="flex items-center justify-center bg-blue-950 px-4 py-4 md:px-10 md:py-5"
      exit={{ y: -10 }}
      initial={{ y: 0 }}
      key="navbar-header"
      transition={{
        duration: 0.5,
        ease: "easeInOut"
      }}
    >
      <div className="flex max-w-4xl grow-1 justify-between">
        <div className="flex grow items-center gap-8">
          <LogoButton />
          <SolutionsDropdown />
          <a className={`ml-3 ${navLinkStyles}`} href="https://pendulum.gitbook.io/vortex" target="_blank">
            Docs
          </a>
        </div>

        <div className="flex items-center">
          <button className="btn btn-vortex-secondary rounded-3xl">Book demo</button>
        </div>
      </div>
    </motion.header>
  );
};
