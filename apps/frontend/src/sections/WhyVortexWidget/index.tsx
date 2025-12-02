import { useState } from "react";
import { CopyButton } from "../../components/CopyButton";

type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

export const WhyVortexWidget = () => {
  const [packageManager, setPackageManager] = useState<PackageManager>({ id: "npm" });

  const installCommands: Record<PackageManager, string> = {
    bun: "bun add @vortexfi/widget",
    npm: "npm install @vortexfi/widget",
    pnpm: "pnpm add @vortexfi/widget",
    yarn: "yarn add @vortexfi/widget"
  };

  return (
    <section className="bg-gray-50 px-4 py-16 md:px-10 lg:py-32">
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2 rounded-lg bg-[#0f172a] p-1">
              {(Object.keys(installCommands) as PackageManager[]).map(pm => (
                <button
                  className={`rounded px-4 py-1.5 font-medium text-sm transition-colors ${
                    packageManager === pm ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                  key={pm}
                  onClick={() => setPackageManager(pm)}
                  type="button"
                >
                  {pm}
                </button>
              ))}
            </div>

            <div className="flex w-full items-center gap-2 rounded-lg bg-[#0f172a] px-4 py-2 font-mono text-gray-300 text-sm">
              <span className="text-green-400">$</span>
              <span className="mr-2">{installCommands[packageManager]}</span>
              <CopyButton className="!bg-transparent !p-0 !text-gray-400 hover:!text-white" noBorder text={"copy"} />
            </div>
          </div>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl bg-[#0f172a] shadow-2xl">
          <div className="flex gap-1 border-gray-800 border-b bg-[#1e293b] p-4">
            <div className="h-3 w-3 rounded-full bg-green-400 hover:bg-green-500"></div>
            <div className="h-3 w-3 rounded-full bg-yellow-400 hover:bg-yellow-500"></div>
            <div className="h-3 w-3 rounded-full bg-red-400 hover:bg-red-500"></div>
          </div>

          <div className="p-6 sm:p-8">
            <pre className="overflow-x-auto font-mono text-gray-300 text-sm leading-relaxed">
              <code>
                <span className="text-pink-500">import</span> <span className="text-yellow-300">{"{"}</span>{" "}
                <span className="text-red-400">VortexWidget</span>
                <span className="text-gray-300">,</span> <span className="text-red-400">useVortexConnection</span>{" "}
                <span className="text-yellow-300">{"}"}</span> <span className="text-pink-500">from</span>{" "}
                <span className="text-green-300">'@vortexfi/widget'</span>
                <span>;</span>
                {"\n\n"}
                <span className="text-pink-500">const</span> <span className="text-blue-400">MyApp</span>{" "}
                <span className="text-pink-500">=</span> <span className="text-yellow-300">()</span>{" "}
                <span className="text-pink-500">{"=>"}</span> <span className="text-yellow-300">{"{"}</span>
                {"\n  "}
                <span className="text-pink-500">const</span> <span className="text-orange-400">vortexConfig</span>{" "}
                <span className="text-pink-500">=</span> <span className="text-blue-400">useVortexConnection</span>
                <span className="text-yellow-300">({"{"}</span> <span>my_app_id</span>
                <span className="text-pink-500">:</span> <span className="text-green-300">'random_app_id'</span>
                <span className="text-yellow-300">{"}"})</span>
                <span className="text-gray-300">;</span>
                {"\n\n  "}
                <span className="text-pink-500">return</span> <span className="text-gray-300">&lt;</span>
                <span className="text-yellow-500">VortexWidget</span> <span className="text-orange-400">config</span>
                <span className="text-pink-500">=</span>
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
      </div>
    </section>
  );
};
