import { motion } from 'motion/react';

import whiteLogo from '../../assets/logo/white.png';
import { ConnectWalletButton } from '../buttons/ConnectWalletButton';
import { NetworkSelector } from '../NetworkSelector';
import { useNetwork } from '../../contexts/network';

export const Navbar = () => {
  const { networkSelectorDisabled } = useNetwork();

  return (
    <>
      <motion.header
        key="navbar-header"
        className="flex items-center justify-between px-4 py-4 bg-blue-950 md:py-5 md:px-10"
        initial={{ y: 0 }}
        animate={{ y: 0 }}
        exit={{ y: -10 }}
        transition={{
          duration: 0.5,
          ease: 'easeInOut',
        }}
      >
        <div className="flex">
          <img src={whiteLogo} alt="Vortex Logo" className="max-w-38" />
        </div>
        <div className="flex items-center">
          <NetworkSelector disabled={networkSelectorDisabled} />
          <ConnectWalletButton />
        </div>
      </motion.header>
    </>
  );
};
