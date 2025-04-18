import { useState, FC } from 'react';
import { Bars4Icon, XMarkIcon } from '@heroicons/react/20/solid';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../helpers/cn';

import whiteLogo from '../../assets/logo/white.png';
import { ConnectWalletButton } from '../buttons/ConnectWalletButton';
import { NetworkSelector } from '../NetworkSelector';
import { useNetwork } from '../../contexts/network';
import { useTranslation } from 'react-i18next';
import { useWidgetMode } from '../../hooks/useWidgetMode';

interface MobileMenuProps {
  onClick: () => void;
  open: boolean;
}

const MobileMenu: FC<MobileMenuProps> = ({ onClick, open }) => (
  <button
    className={cn(
      'w-[3rem] ml-2 group btn btn-circle lg:hidden z-[51]',
      open ? 'bg-blue-950 border-0 shadow-none' : 'btn-vortex-secondary',
    )}
    type="button"
    onClick={onClick}
  >
    <motion.div
      initial={false}
      animate={open ? 'open' : 'closed'}
      variants={{
        open: {
          rotate: 90,
        },
        closed: {
          rotate: 0,
        },
      }}
      transition={{ duration: 0.2 }}
    >
      {open ? (
        <XMarkIcon className="w-6 h-6 text-white" />
      ) : (
        <Bars4Icon className="w-6 h-6 text-white group-hover:text-pink-600" />
      )}
    </motion.div>
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
      delay: 0.1,
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
  closeMenu: () => void;
}

const MobileMenuList: FC<MobileMenuListProps> = () => (
  <motion.div
    className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-blue-950"
    initial="hidden"
    animate="visible"
    exit="exit"
    variants={menuVariants}
  >
    <nav>
      <Links />
    </nav>
    <img src={whiteLogo} alt="Vortex Logo" className="absolute translate-x-1/2 max-w-26 max-h-6 bottom-10 right-1/2" />
  </motion.div>
);

const Links = () => {
  const { t } = useTranslation();

  const links = [
    { title: t('components.navbar.sellCrypto'), href: '/' },
    { title: t('components.navbar.howItWorks'), href: 'https://www.vortexfinance.co/#lowest-code' },
    { title: t('components.navbar.community'), href: 'https://www.vortexfinance.co/#call-to-action' },
  ];

  return (
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
};

export const Navbar = () => {
  const [showMenu, setShowMenu] = useState(false);
  const { networkSelectorDisabled } = useNetwork();
  const isWidgetMode = useWidgetMode();

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
          {!isWidgetMode && (
            <nav className="hidden m-auto lg:block">
              <Links />
            </nav>
          )}
        </div>
        <div className="flex items-center">
          <NetworkSelector disabled={networkSelectorDisabled} />
          <ConnectWalletButton />
          {!isWidgetMode && <MobileMenu onClick={() => setShowMenu((state) => !state)} open={showMenu} />}
        </div>
      </motion.header>
      <AnimatePresence mode="wait">
        {showMenu && !isWidgetMode && <MobileMenuList closeMenu={() => setShowMenu(false)} />}
      </AnimatePresence>
    </>
  );
};
