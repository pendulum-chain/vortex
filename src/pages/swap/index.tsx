import { ArrowDownIcon, Bars4Icon, CheckIcon, ChevronDownIcon, PlayCircleIcon } from '@heroicons/react/20/solid';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import whiteLogo from '../../assets/logo/white.png';

const navItems = [
  { title: 'About', link: '/about' },
  { title: 'Ecosystem', link: '/ecosystem' },
  { title: 'Help', link: '/help' },
];

export const Swap = () => {
  return (
    <>
      <header className="bg-blue-950 flex py-7 justify-between items-center px-4 md:px-10 relative">
        <div className="flex">
          <img src={whiteLogo} alt="Vortex Logo" className="max-w-52 max-h-12 mr-6" />
          <nav className="m-auto">
            <ul className="flex justify-around items-center">
              {navItems.map((item) => (
                <li key={item.title}>
                  <a href={item.link} className="text-white font-thin px-7 hover:text-amber-500 hover:underline">
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="flex items-center">
          <button className="btn rounded-3xl bg-pink-600 text-white border-pink-600">
            Connect Wallet
            <PlayCircleIcon className="w-5" />
          </button>
          <button className="btn btn-square btn-ghost bg-pink-600 ml-5 md:hidden collapse">
            <Bars4Icon className="w-8 text-white" />
          </button>
        </div>
      </header>
      <main className="flex justify-center items-center mt-12">
        <section className="shadow-custom px-4 py-8 w-1/2 rounded-lg">
          <h1 className="text-3xl text-blue-700 font-bold text-center mb-5">Withdraw</h1>
          <label>
            <span className="font-thin">You withdraw</span>
            <div className="border border-slate-200 input w-full bg-white">
              <input type="text" className=" w-full" />
            </div>
          </label>
          <div className="w-full flex justify-center my-5">
            <button>
              <ArrowDownIcon className="w-7 text-blue-700" />
            </button>
          </div>
          <label>
            <span className="font-thin">You receive</span>
            <div className="border border-slate-200 input w-full bg-white">
              <input type="text" className=" w-full" />
            </div>
          </label>
          <p className="font-thin text-center my-5">1 USDC = 5.5264 BRL</p>
          <details className="collapse border border-blue-700">
            <summary className="collapse-title py-2 px-4 min-h-0">
              <div className="flex justify-between items-center">
                <p>
                  <span className="font-bold">1746.24 BRL</span> is what you will receive, after fees
                </p>
                <div className="flex items-center">
                  <p>Show fees</p>
                  <ChevronDownIcon className="w-8 text-blue-700" />
                </div>
              </div>
            </summary>
            <div className="collapse-content">
              <div className="flex justify-between">
                <p>Total fees</p>
                <div className="flex">
                  <LocalGasStationIcon className="w-8 text-blue-700" />
                  <p>$0.5</p>
                </div>
              </div>
            </div>
          </details>
          <div className="w-full flex items-center justify-center mt-5">
            <ul>
              <li className="flex">
                <CheckIcon className="w-4 text-pink-500 mr-2" />
                <p>
                  You could save <span className="font-bold text-blue-700">up to 43.74 USD</span>
                </p>
              </li>
              <li className="flex">
                <CheckIcon className="w-4 text-pink-500 mr-2" />
                <p>
                  Should arrive in <span className="font-bold text-blue-700">5 minutes</span>
                </p>
              </li>
              <li className="flex">
                <CheckIcon className="w-4 text-pink-500 mr-2" />
                <p>
                  <span className="font-bold text-blue-700">Verify super fast</span> with your Tax ID
                </p>
              </li>
            </ul>
          </div>
          <button className="btn rounded-xl bg-blue-700 text-white w-full mt-5">Connect Wallet</button>
        </section>
      </main>
    </>
  );
};
