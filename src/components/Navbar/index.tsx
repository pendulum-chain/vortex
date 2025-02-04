import { useState, FC } from 'react';
import { Bars4Icon, XMarkIcon } from '@heroicons/react/20/solid';
import { motion, AnimatePresence } from 'motion/react';

import whiteLogo from '../../assets/logo/white.png';
import { ConnectWalletButton } from '../buttons/ConnectWalletButton';
import { NetworkSelector } from '../NetworkSelector';
import { useNetwork } from '../../contexts/network';

const links = [
  { title: 'Sell Crypto', href: '/' },
  { title: 'How it works', href: 'https://www.vortexfinance.co/#lowest-code' },
  { title: 'Community', href: 'https://www.vortexfinance.co/#call-to-action' },
];

interface MobileMenuProps {
  onClick: () => void;
}

const MobileMenu: FC<MobileMenuProps> = ({ onClick }) => (
  <button
    className="ml-2 bg-pink-600 group btn-vortex-secondary btn btn-circle lg:hidden"
    type="button"
    onClick={onClick}
  >
    <Bars4Icon className="w-6 text-white group-hover:text-pink-600" />
  </button>
);

const menuVariants = {
  hidden: {
    y: '-100vh',
  },
  visible: {
    y: 0,
    transition: {
      type: 'tween',
      duration: 0.3,
    },
  },
  exit: {
    y: '-100vh',
    transition: {
      type: 'tween',
      duration: 0.3,
      delay: 0.3,
    },
  },
};
interface MobileMenuListProps {
  showMenu: boolean;
  closeMenu: () => void;
}

const MobileMenuList: FC<MobileMenuListProps> = ({ showMenu, closeMenu }) => (
  <AnimatePresence>
    {showMenu && (
      <motion.div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-blue-950"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={menuVariants}
      >
        <button onClick={closeMenu} className="absolute right-12 top-7">
          <XMarkIcon className="w-8 text-white" />
        </button>
        <nav>
          <Links />
        </nav>
        <img
          src={whiteLogo}
          alt="Vortex Logo"
          className="absolute translate-x-1/2 max-w-26 max-h-6 bottom-10 right-1/2"
        />
      </motion.div>
    )}
  </AnimatePresence>
);

const Links = () => (
  <ul className="lg:flex lg:items-center lg:justify-around">
    {links.map((link) => (
      <li key={link.title} className="mr-4 mb-9 lg:mb-0">
        <a
          href={link.href}
          target={link.href.startsWith('https') ? '_blank' : ''}
          rel={link.href.startsWith('https') ? 'noreferrer' : ''}
          className="px-3 text-lg font-thin text-white hover:text-amber-500 hover:underline lg:px-0"
        >
          {link.title}
        </a>
      </li>
    ))}
  </ul>
);

export const Navbar = () => {
  const [showMenu, setShowMenu] = useState(false);
  const { networkSelectorDisabled } = useNetwork();

  return (
    <header className="flex items-center justify-between px-4 py-4 bg-blue-950 md:py-5 md:px-10">
      <div className="flex">
        <nav className="hidden m-auto lg:block">
          <Links />
        </nav>
      </div>
      <div className="flex items-center">
        <NetworkSelector disabled={networkSelectorDisabled} />
        <ConnectWalletButton />
        <MobileMenu onClick={() => setShowMenu(true)} />
        <MobileMenuList showMenu={showMenu} closeMenu={() => setShowMenu(false)} />
      </div>
    </header>
  );
};
