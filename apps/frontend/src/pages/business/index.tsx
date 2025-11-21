import BackgroundImage2 from "../../assets/bg-4.svg";
import VortexMetamaskImage from "../../assets/vortex-metamask.png";

export function BusinessMain() {
  return (
    <main>
      <section className="container mx-auto pt-32 flex flex-col lg:flex-row gap-10 relative lg:mb-32">
        <div className="flex w-full flex-col justify-center lg:w-1/2">
          <div>
            <p className="pt-8 text-center font-light text-3xl text-black sm:text-5xl md:text-6xl lg:pt-0 lg:text-start">
              Enable your customers to buy and sell crypto instantly - directly{" "}
              <span className="text-blue-700">inside your APP</span>
            </p>
            <p className="my-6 text-center lg:text-left sm:text-xl">
              With one simple, free integration Vortex handles KYC, compliance and settlement so you can stay focused on your
              product.
            </p>
          </div>
          <div className="mt-4 flex gap-2 justify-center lg:justify-start">
            <a
              className="btn btn-vortex-primary"
              href="https://api-docs.vortexfinance.co/"
              rel="noopener noreferrer"
              target="_blank"
            >
              SDK integration
            </a>
            <div className="relative">
              <div className="badge absolute top-[-10px] right-[-20px] z-20 bg-blue-700 text-white">Coming Soon</div>
              <button className="btn btn-vortex-primary-inverse" disabled>
                Widget integration
              </button>
            </div>
          </div>
        </div>
        <img
          alt="Background"
          className="hidden lg:block absolute right-[-100px] bottom-[-200px] z-1 w-[300px] h-[300px]"
          src={BackgroundImage2}
        />
        <img
          alt="Vortex Metamask"
          className="hover:scale-[1.01] hidden lg:block transition-all duration-300 absolute right-[-140px] bottom-[-80px] w-3/5 z-20"
          src={VortexMetamaskImage}
        />
        <div className="lg:w-1/2 relative">
          <img
            alt="Vortex Metamask"
            className="hover:scale-[1.01] block lg:hidden transition-all duration-300"
            src={VortexMetamaskImage}
          />
        </div>
      </section>
    </main>
  );
}
