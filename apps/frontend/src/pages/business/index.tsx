import WidgetSnippetImageBRL from "../../assets/widget-full-snippet-brl.png";
import WidgetSnippetImageEUR from "../../assets/widget-full-snippet-eur.png";
import WidgetSnippetImageSell from "../../assets/widget-full-snippet-sell.png";

export function BusinessMain() {
  return (
    <main>
      <section className="container mx-auto grid grid-cols-1 gap-x-20 px-4 md:px-10 py-8 gap-y-10 lg:grid-cols-2 grid-rows-2 lg:grid-rows-1 pt-16 md:py-32">
        <div className="flex flex-col justify-center animate-slide-up">
          <div>
            <h1 className="animate-slide-up text-h1 text-center text-black lg:text-start">
              Enable your customers to buy and sell crypto instantly - directly{" "}
              <span className="text-blue-700">inside your APP</span>
            </h1>
            <p className="animate-slide-up my-6 text-center lg:text-left sm:text-xl">
              With one simple, free integration Vortex handles KYC, compliance and settlement so you can stay focused on your
              product.
            </p>
          </div>
          <div className="animate-slide-up mt-4 flex gap-2 justify-center lg:justify-start">
            <a
              className="btn btn-vortex-primary"
              href="https://api-docs.vortexfinance.co/"
              rel="noopener noreferrer"
              target="_blank"
            >
              SDK integration
            </a>
            <div className="relative">
              <div className="animate-slide-up badge absolute top-[-10px] right-[-20px] z-20 bg-blue-700 text-white">
                Coming Soon
              </div>
              <button className="animate-slide-up btn btn-vortex-primary-inverse" disabled>
                Widget integration
              </button>
            </div>
          </div>
        </div>

        <div className="relative flex justify-around items-center w-flex">
          <img
            alt="Widget Snippet EUR"
            className="hover:scale-[1.11] animate-slide-up transition-all cursor-pointer duration-300 shadow-custom rounded-lg w-1/3 z-10 hover:z-30"
            draggable={false}
            src={WidgetSnippetImageEUR}
          />

          <img
            alt="Widget Snippet Sell"
            className="hover:scale-[1.11] scale-[1.10] animate-slide-up transition-all cursor-pointer duration-300 shadow-custom rounded-lg w-1/3 z-20 hover:z-30"
            draggable={false}
            src={WidgetSnippetImageSell}
          />

          <img
            alt="Widget Snippet BRL"
            className="hover:scale-[1.11] animate-slide-up transition-all cursor-pointer duration-300 shadow-custom rounded-lg w-1/3 z-10 hover:z-30"
            draggable={false}
            src={WidgetSnippetImageBRL}
          />
        </div>
      </section>
    </main>
  );
}
