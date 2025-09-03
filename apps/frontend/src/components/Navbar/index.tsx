import { motion } from "motion/react";

import whiteMobileLogo from "../../assets/logo/circle.png";
import whiteLogo from "../../assets/logo/white.png";
import { useRampActor } from "../../contexts/rampState";
import { ConnectWalletButton } from "../buttons/ConnectWalletButton";
import { LanguageSelector } from "../LanguageSelector";

export const Navbar = () => {
  const rampActor = useRampActor();

  const onLogoClick = () => {
    // Reset the ramp state and go back to the home page
    const cleanUrl = window.location.origin;
    window.history.replaceState({}, "", cleanUrl);

    rampActor.send({ type: "RESET_RAMP" });
  };

  return (
    <>
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
        <div className="flex max-w-2xl grow items-center justify-between">
          <div className="flex grow items-center justify-evenly align-center">
            <button className="cursor-pointer" onClick={onLogoClick}>
              <img alt="Vortex Logo" className="hidden max-w-38 sm:block" src={whiteLogo} />
              <img alt="Vortex Logo" className="block max-w-12 sm:hidden" src={whiteMobileLogo} />
            </button>
            <span className="ml-3 text-white text-xl">Solutions</span>
            <a className="ml-3 text-white text-xl" href="https://pendulum.gitbook.io/vortex" target="_blank">
              Docs
            </a>
          </div>
          <div className="flex items-center">
            <LanguageSelector />
            <ConnectWalletButton />
          </div>
        </div>
      </motion.header>
    </>
  );
};
