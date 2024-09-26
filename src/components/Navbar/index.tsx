import { Bars4Icon, XMarkIcon } from '@heroicons/react/20/solid';
import { motion, AnimatePresence } from 'framer-motion';

import whiteLogo from '../../assets/logo/white.png';
import { ConnectWallet } from '../buttons/ConnectWallet';
import { useState } from 'preact/hooks';
import { FC } from 'preact/compat';

const links = [
  { title: 'Offramp', href: '/' },
  { title: 'How it works', href: 'https://www.vortexfinance.co/#lowest-code' },
  { title: 'Community', href: 'https://www.vortexfinance.co/#call-to-action' },
];

interface MobileMenuProps {
  onClick: () => void;
}

const MobileMenu: FC<MobileMenuProps> = ({ onClick }) => (
  <button className="ml-2 bg-pink-600 btn btn-square btn-ghost md:hidden" type="button" onClick={onClick}>
    <Bars4Icon className="w-8 text-white" />
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
        <button onClick={closeMenu} className="absolute right-6 top-8">
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
  <ul className="md:flex md:items-center md:justify-around">
    {links.map((link) => (
      <li key={link.title} className="mb-9 md:mb-0">
        <a
          href={link.href}
          target={link.href.startsWith('https') ? '_blank' : ''}
          rel={link.href.startsWith('https') ? 'noreferrer' : ''}
          className="px-3 text-lg font-thin text-white lg:px-4 lg:text-xl lg:px-7 hover:text-amber-500 hover:underline"
        >
          {link.title}
        </a>
      </li>
    ))}
  </ul>
);

export const Navbar = () => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header className="flex items-center justify-between px-4 py-4 bg-blue-950 md:py-7 md:px-10">
      <div className="flex">
        <a href="https://www.vortexfinance.co/" target="_blank" rel="noreferrer" className="flex">
          <img src={whiteLogo} alt="Vortex Logo" className="mr-1 max-w-26 max-h-6 md:max-w-52 md:max-h-12" />
          Alpha
        </a>
        <nav className="hidden m-auto md:block">
          <Links />
        </nav>
      </div>
      <div className="flex items-center">
        <ConnectWallet />
        <MobileMenu onClick={() => setShowMenu(true)} />
        <MobileMenuList showMenu={showMenu} closeMenu={() => setShowMenu(false)} />
      </div>
    </header>
  );
};
