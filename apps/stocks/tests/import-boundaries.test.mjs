import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, posix } from "node:path";
import test from "node:test";
import { APP, sourceFiles } from "./helpers.mjs";

// Static imports: `import x from "m"`, `import "m"`, `export … from "m"`. Dynamic: `import("m")`.
const staticImports = (text) => [...text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g)].map((match) => match[1] || match[2]);
const dynamicImports = (text) => [...text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]);

test("only the lazy Privy shell may import Privy (the landing renders before the 2 MB chunk)", () => {
  for (const file of sourceFiles()) {
    const privy = staticImports(file.text).filter((name) => name.startsWith("@privy-io/") || name === "@vortexfi/consumer-kit/privy");
    if (file.path !== "src/PrivyShell.jsx") assert.deepEqual(privy, [], `${file.path} imports ${privy}`);
  }
});

test("recharts only in the lazy PriceChart; the SDK never from the app (the kit loads it dynamically)", () => {
  for (const file of sourceFiles()) {
    const imports = [...staticImports(file.text), ...dynamicImports(file.text)];
    if (file.path !== "src/components/PriceChart.jsx") assert.ok(!imports.includes("recharts"), `${file.path} imports recharts`);
    assert.ok(!imports.some((name) => name === "@vortexfi/sdk" || name.startsWith("@vortexfi/sdk/")), `${file.path} imports the SDK`);
  }
});

test("the library layer is framework-free: no React, Privy, recharts or SDK in src/lib", () => {
  const forbidden = (name) => ["react", "react-dom", "recharts", "@vortexfi/sdk", "@vortexfi/consumer-kit/privy"].includes(name) || name.startsWith("react-dom/") || name.startsWith("@privy-io/");
  const lib = sourceFiles().filter((file) => file.path.startsWith("src/lib/"));
  assert.ok(lib.length >= 15, "src/lib modules not found");
  for (const file of lib) {
    const bad = [...staticImports(file.text), ...dynamicImports(file.text)].filter(forbidden);
    assert.deepEqual(bad, [], `${file.path} imports ${bad}`);
  }
});

test("main.jsx lazy-imports the Privy shell and the chart once they exist", () => {
  const main = sourceFiles().find((file) => file.path === "src/main.jsx");
  assert.ok(main, "src/main.jsx is the entry");
  if (existsSync(join(APP, "src/PrivyShell.jsx"))) {
    assert.ok(dynamicImports(main.text).some((name) => name.endsWith("PrivyShell.jsx")), "PrivyShell.jsx must be lazy");
    assert.ok(!staticImports(main.text).some((name) => name.endsWith("PrivyShell.jsx")), "PrivyShell.jsx imported statically");
  }
  if (existsSync(join(APP, "src/components/PriceChart.jsx"))) {
    const eager = sourceFiles().filter((file) => staticImports(file.text).some((name) => name.endsWith("PriceChart.jsx")));
    assert.deepEqual(eager.map((file) => file.path), [], "PriceChart.jsx must only be imported lazily");
  }
});

test("the entry's static import graph stays light: no Privy, SDK, chart, flows, viem clients or ramp adapters", () => {
  const files = new Map(sourceFiles().map((file) => [file.path, file.text]));
  const local = new Set();
  const external = new Set();
  const visit = (path) => {
    if (local.has(path) || !files.has(path)) return;
    local.add(path);
    for (const specifier of staticImports(files.get(path))) {
      if (specifier.startsWith(".")) visit(posix.normalize(posix.join(posix.dirname(path), specifier)));
      else external.add(specifier);
    }
  };
  visit("src/main.jsx");
  assert.ok(local.has("src/App.jsx") && local.has("src/screens/Landing.jsx"), "the walk reaches the landing");
  const lazyOnly = ["src/PrivyShell.jsx", "src/runtime.js", "src/services.js", "src/components/PriceChart.jsx", "src/flows/BuyFlow.jsx", "src/flows/SellFlow.jsx", "src/flows/PixStep.jsx",
    "src/lib/portfolio.js", "src/lib/ramp-adapter.js", "src/lib/vortex-stocks.js", "src/lib/simulated-ramp.js", "src/lib/gas-reserve.js"];
  for (const path of lazyOnly) assert.ok(!local.has(path), `${path} is in the entry's static graph`);
  for (const name of external) {
    assert.ok(!name.startsWith("@privy-io/") && name !== "@vortexfi/consumer-kit/privy", `entry imports ${name}`);
    assert.ok(!["recharts", "qrcode.react", "@phosphor-icons/react"].includes(name) && !name.startsWith("@vortexfi/sdk"), `entry imports ${name}`);
  }
});
