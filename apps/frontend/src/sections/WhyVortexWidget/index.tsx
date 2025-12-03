import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/solid";
import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "../../components/CopyButton";
import TabsClipPath from "./TabsClipPath";

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
  const { t } = useTranslation();

  const [packageManager, setPackageManager] = useState<PackageManager>("npm");

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

        <TabsClipPath
          activeTab={packageManager}
          onChange={tab => setPackageManager(tab as PackageManager)}
          tabs={Object.keys(installCommands)}
        />

        <div className="relative mx-auto mt-4 flex w-1/2 items-center gap-2 rounded-xl bg-gray-100 px-4 py-4 font-mono text-sm shadow-lg">
          <span className="text-pink-500">$</span>
          <span className="mr-2 text-primary">{installCommands[packageManager]}</span>
          <CopyButton className="absolute right-[10px] rounded-xl py-2" text={"copy"} />
        </div>

        <WidgetCodeSnippet />

        <div className="flex justify-center">
          <div className="relative mt-12">
            <div className="badge absolute top-[-10px] right-[-20px] z-20 bg-blue-700 text-white">
              {t("pages.business.hero.comingSoon")}
            </div>
            <button className="btn btn-vortex-primary-inverse" disabled>
              Get started <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
