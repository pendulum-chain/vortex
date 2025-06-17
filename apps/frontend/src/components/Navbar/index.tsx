import { motion } from "motion/react";

import whiteMobileLogo from "../../assets/logo/circle.png";
import whiteLogo from "../../assets/logo/white.png";
import { useNetwork } from "../../contexts/network";
import { LanguageSelector } from "../LanguageSelector";
import { NetworkSelector } from "../NetworkSelector";
import { ConnectWalletButton } from "../buttons/ConnectWalletButton";

export const Navbar = () => {
  const { networkSelectorDisabled } = useNetwork();

  return (
    <>
      <motion.header
        key="navbar-header"
        className="flex items-center justify-between bg-blue-950 px-4 py-4 md:px-10 md:py-5"
        initial={{ y: 0 }}
        animate={{ y: 0 }}
        exit={{ y: -10 }}
        transition={{
          duration: 0.5,
          ease: "easeInOut"
        }}
      >
        <div className="flex">
          <img src={whiteLogo} alt="Vortex Logo" className="hidden max-w-38 sm:block" />
          <img src={whiteMobileLogo} alt="Vortex Logo" className="block max-w-12 sm:hidden" />
        </div>
        <div className="flex items-center">
          <LanguageSelector disabled={networkSelectorDisabled} />
          <NetworkSelector disabled={networkSelectorDisabled} />
          <ConnectWalletButton />
        </div>
      </motion.header>
    </>
  );
};
