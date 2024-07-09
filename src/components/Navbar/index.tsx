import { Bars4Icon } from '@heroicons/react/20/solid';
import whiteLogo from '../../assets/logo/white.png';
import { ConnectWallet } from '../buttons/ConnectWallet';

const navItems = [
  { title: 'About', link: '/about' },
  { title: 'Ecosystem', link: '/ecosystem' },
  { title: 'Help', link: '/help' },
];

const MobileMenu = () => (
  <button className="btn btn-square btn-ghost bg-pink-600 ml-5 md:hidden collapse">
    <Bars4Icon className="w-8 text-white" />
  </button>
);

export const Navbar = () => (
  <header className="bg-blue-950 flex py-7 justify-between items-center px-4 md:px-10 relative">
    <div className="flex">
      <img src={whiteLogo} alt="Vortex Logo" className="max-w-52 max-h-12 mr-6" />
      <nav className="m-auto">
        <ul className="justify-around items-center hidden md:flex">
          {navItems.map((item) => (
            <li key={item.title}>
              <a href={item.link} className="text-white font-thin px-4 lg:px-7 hover:text-amber-500 hover:underline">
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
    <div className="flex items-center">
      <ConnectWallet />
      {/* <MobileMenu /> */}
    </div>
  </header>
);
