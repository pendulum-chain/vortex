const steps = [
  {
    id: 1,
    text: 'Connect your wallet and enter the amount in cryptocurrency you wish to sell.',
  },
  {
    id: 2,
    text: 'Continue to the partner site and provide your email and payment details.',
  },
  {
    id: 3,
    text: 'Return to VortexFinance.co and confirm the transaction in your wallet.',
  },
  {
    id: 4,
    text: 'Wait for the funds to arrive in your account.',
  },
];

export const HowToSell = () => (
  <section className="relative py-32 overflow-hidden bg-[radial-gradient(at_50%_50%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))]">
    <canvas className="absolute inset-0 w-full h-full" />
    <div className="container relative z-10 px-4 mx-auto mb-12">
      <div className="mb-12 text-center">
        <p className="text-4xl text-white md:text-5xl">How to sell cryptocurrency online with Vortex Finance</p>
      </div>
      <div className="relative flex justify-center">
        <div className="relative grid max-w-4xl grid-cols-1 gap-8 xs:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <div key={step.id} className="relative z-10 group">
              <div className="flex flex-col items-center">
                <div className="flex items-center justify-center w-20 h-20 mb-4 transition-all duration-300 border-2 border-blue-700 rounded-full shadow-lg bg-[radial-gradient(at_50%_50%,theme(colors.black),theme(colors.blue.950),theme(colors.black)_134%)] group-hover:scale-105">
                  <span className="text-3xl font-bold text-white">{step.id}</span>
                </div>
                <div className="w-48 text-center transition-all duration-300 group-hover:transform group-hover:translate-y-1">
                  <p className="text-xs text-white/90">{step.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);
