import { useLayoutEffect, useRef, useState } from "react";
import { CopyButton } from "../../components/CopyButton";

const WidgetCodeSnippet = () => (
  <div className="mt-12 overflow-hidden rounded-2xl bg-[#0f172a] shadow-2xl">
    <div className="flex gap-2 border-gray-800 border-b bg-[#1e293b] p-4">
      <div className="h-3 w-3 rounded-full bg-[#66cc91] hover:bg-[#48bb78]"></div>
      <div className="h-3 w-3 rounded-full bg-[#e5c07b] hover:bg-[#d19a66]"></div>
      <div className="h-3 w-3 rounded-full bg-[#e06c75] hover:bg-[#d05b64]"></div>
    </div>

    <div className="p-6 sm:p-8">
      <pre className="overflow-x-auto font-mono text-gray-300 text-sm leading-relaxed">
        <code>
          <span className="text-[#c678dd]">import</span> <span className="text-yellow-300">{"{"}</span>{" "}
          <span className="text-[#e06c75]">VortexWidget</span>
          <span className="text-gray-300">,</span> <span className="text-[#e06c75]">useVortexConnection</span>{" "}
          <span className="text-yellow-300">{"}"}</span> <span className="text-[#c678dd]">from</span>{" "}
          <span className="text-green-300">'@vortexfi/widget'</span>
          <span>;</span>
          {"\n\n"}
          <span className="text-[#c678dd]">const</span> <span className="text-[#61afef]">MyApp</span>{" "}
          <span className="text-[#c678dd]">=</span> <span className="text-yellow-300">()</span>{" "}
          <span className="text-[#c678dd]">{"=>"}</span> <span className="text-yellow-300">{"{"}</span>
          {"\n  "}
          <span className="text-[#c678dd]">const</span> <span className="text-[#d19a66]">vortexConfig</span>{" "}
          <span className="text-[#c678dd]">=</span> <span className="text-[#61afef]">useVortexConnection</span>
          <span className="text-yellow-300">({"{"}</span>
          {"\n     "} <span className="text-[#e5c07b]">my_app_id</span>
          <span className="text-[#c678dd]">:</span> <span className="text-green-300">'random_app_id'</span>
          {"\n     "} <span className="text-[#e5c07b]">inputAmount</span>
          <span className="text-[#c678dd]">:</span> <span className="text-green-300">'100'</span>
          {"\n     "} <span className="text-[#e5c07b]">inputCurrency</span>
          <span className="text-[#c678dd]">:</span> <span className="text-green-300">'BRL'</span>
          {"\n     "} <span className="text-[#e5c07b]">outputCurrency</span>
          <span className="text-[#c678dd]">:</span> <span className="text-green-300">'USDC'</span>
          {"\n     "} <span className="text-[#e5c07b]">rampType</span>
          <span className="text-[#c678dd]">:</span> <span className="text-green-300">'on'</span>
          {"\n     "} <span className="text-[#e5c07b]">to</span>
          <span className="text-[#c678dd]">:</span> <span className="text-green-300">'polygon'</span>
          {"\n  "}
          <span className="text-yellow-300">{"}"})</span>
          <span className="text-gray-300">;</span>
          {"\n\n  "}
          <span className="text-[#c678dd]">return</span> <span className="text-gray-300">&lt;</span>
          <span className="text-[#e5c07b]">VortexWidget</span> <span className="text-[#d19a66]">config</span>
          <span className="text-[#c678dd]">=</span>
          <span>
            {"{"}vortexConfig{"}"}
          </span>{" "}
          <span className="text-gray-300">/&gt;</span>
          {"\n"}
          <span className="text-yellow-300">{"}"}</span>
          <span className="text-gray-300">;</span>
        </code>
      </pre>
    </div>
  </div>
);

type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

export const WhyVortexWidget = () => {
  const [packageManager, setPackageManager] = useState<PackageManager>("npm");
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTabElementRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const updateClipPath = () => {
      const container = containerRef.current;
      const activeTabElement = activeTabElementRef.current;

      if (container && activeTabElement) {
        const { offsetLeft, offsetWidth } = activeTabElement;
        const clipLeft = offsetLeft;
        const clipRight = offsetLeft + offsetWidth;
        container.style.clipPath = `inset(0 ${Number(container.offsetWidth - clipRight).toFixed()}px 0 ${Number(
          clipLeft
        ).toFixed()}px round 4px)`;
      }
    };

    if (packageManager) {
      updateClipPath();
    }
    window.addEventListener("resize", updateClipPath);
    return () => window.removeEventListener("resize", updateClipPath);
  }, [packageManager]);

  const installCommands: Record<PackageManager, string> = {
    bun: "bun add @vortexfi/widget",
    npm: "npm install @vortexfi/widget",
    pnpm: "pnpm add @vortexfi/widget",
    yarn: "yarn add @vortexfi/widget"
  };

  return (
    <section className="px-4 py-16 md:px-10 lg:py-32">
      <div className="container mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <h1 className="mx-auto max-w-3xl text-gray-800 text-h2">
            One small snippet of code to help you <strong className="text-primary">scale your business quickly</strong>
          </h1>
          <p className="mt-6 text-gray-500 text-lg">
            Our offramp and onramp can be integrated into your app in 5 minutes - see for yourself.
          </p>
        </div>

        <div className="flex flex-col">
          <div className="flex flex-col gap-4">
            <div className="relative">
              <div className="flex gap-2 rounded-lg bg-[#0f172a] p-1">
                {(Object.keys(installCommands) as PackageManager[]).map(pm => (
                  <button
                    className="rounded px-4 py-1.5 font-medium text-gray-400 text-sm transition-colors hover:text-white"
                    key={pm}
                    onClick={() => setPackageManager(pm)}
                    ref={packageManager === pm ? activeTabElementRef : null}
                    type="button"
                  >
                    {pm}
                  </button>
                ))}
              </div>

              <div aria-hidden className="absolute inset-0 z-10" ref={containerRef}>
                <div className="flex gap-2 rounded-lg bg-[#0f172a] p-1">
                  {(Object.keys(installCommands) as PackageManager[]).map(pm => (
                    <button
                      className="rounded bg-blue-600 px-4 py-1.5 font-medium text-sm text-white"
                      key={pm}
                      onClick={() => setPackageManager(pm)}
                      tabIndex={-1}
                      type="button"
                    >
                      {pm}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex w-full items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 font-mono text-gray-300 text-sm">
              <span className="text-green-400">$</span>
              <span className="mr-2 text-primary">{installCommands[packageManager]}</span>
              <CopyButton className="" text={"copy"} />
            </div>
          </div>
        </div>

        <WidgetCodeSnippet />
      </div>
    </section>
  );
};
