import BackgroundImage from "../../assets/bg-1.svg";
import VortexMetamaskImage from "../../assets/vortex-metamask.png";
import { BaseLayout } from "../../layouts";

export function BusinessMain() {
  const main = (
    <main>
      <section className="container mx-auto mt-18 flex gap-10">
        <div className="flex w-full flex-col justify-center md:w-2/5">
          <div>
            <p className="pt-8 text-center font-light text-3xl text-black sm:text-4xl lg:pt-0 lg:text-start">
              Enable your customers to buy and sell crypto instantly - directly{" "}
              <span className="text-blue-700">inside your APP</span>
            </p>
            <p className="my-4">
              With one simple, free integration Vortex handles KYC, compliance and settlement so you can stay focused on your
              product.
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn btn-vortex-primary">SDK integration</button>
            <div className="relative">
              <div className="badge absolute top-[-10px] right-[-20px] z-20 bg-blue-700 text-white">Coming Soon</div>
              <button className="btn btn-vortex-primary-inverse" disabled>
                Widget integration
              </button>
            </div>
          </div>
        </div>
        <div className="flex w-full flex-col gap-4 md:w-3/5">
          <div className="relative w-full">
            <img alt="Background" className="absolute right-[-100px] bottom-[-100px] z-1 h-full w-full" src={BackgroundImage} />
            <img alt="Vortex Metamask" className="relative z-20 w-full" src={VortexMetamaskImage} />
            {/* <div className="absolute top-[80%] left-[40%] h-full w-full rotate-180 bg-[radial-gradient(circle_at_74%_98%,theme(colors.blue.900),transparent_30%)]">
              {" "}
            </div> */}
          </div>
        </div>
      </section>
    </main>
  );

  return <BaseLayout main={main} />;
}
