import quoteRequestPreview from "../../assets/quote-request-preview.mp4";

export function WhyVortexApi() {
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))] py-16 md:py-32 px-4 md:px-10">
      <div className="container mx-auto">
        <div className="flex flex-col justify-center items-center animate-slide-up">
          <h1 className="text-h1 pt-8 text-center text-white font-bold">Need frequent crypto-fiat settlements?</h1>
          <h1 className="text-h1 pt-2 text-center text-blue-400 lg:pt-0 lg:text-start font-bold">Use Vortex API</h1>
        </div>

        <div className="grid grid-cols-1 gap-x-20 gap-y-10 lg:grid-cols-[1fr_2fr] justify-center items-center">
          <ul>
            <li>
              <h2 className="text-h3 font-bold mt-6 text-blue-400 text-center lg:text-left">Automated by design</h2>
              <p className="text-body mt-3 px-10 text-center text-white lg:px-0 lg:text-left">
                Trigger settlements directly from custody wallets, multisigs or smart contracts
              </p>
            </li>
            <li>
              <h2 className="text-h3 font-bold mt-6 text-blue-400 text-center lg:text-left">True mid-market pricing</h2>
              <p className="text-body mt-3 px-10 text-center text-white lg:px-0 lg:text-left">
                Instant quotes. Linked to interbank/Binance FX liquidity. All in cost from 5-45 bps.
              </p>
            </li>
            <li>
              <h2 className="text-h3 font-bold mt-6 text-blue-400 text-center lg:text-left">Deep liquidity</h2>
              <p className="text-body mt-3 px-10 text-center text-white lg:px-0 lg:text-left">
                Tap into institutional grade rails to execute reliably, even at scale.
              </p>
            </li>
          </ul>
          <div className="mt-0 md:mt-12">
            <video
              aria-label="Quote request preview"
              autoPlay
              className="rounded-xl"
              controls={false}
              loop
              muted
              playsInline
              src={quoteRequestPreview}
            />
            <p className="text-h2 mt-3 px-10 text-center text-white lg:px-0 lg:text-left">
              Obtain a quote. Register the ramp. Execute the ramp.
            </p>
            <div className="flex gap-2 justify-center items-center mt-3">
              <a
                className="btn btn-vortex-primary px-10 text-white"
                href="https://api-docs.vortexfinance.co/"
                rel="noopener noreferrer"
                target="_blank"
              >
                Read our docs
              </a>
              <a
                className="btn btn-vortex-primary-inverse px-10"
                href="https://www.npmjs.com/package/@vortexfi/sdk"
                rel="noopener noreferrer"
                target="_blank"
              >
                See the NPM package
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
