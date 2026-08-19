import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dir, "..");
const entrypoint = resolve(packageRoot, "src/index.ts");
const nodeStoragePath = resolve(packageRoot, "src/storage.ts");

const result = await Bun.build({
  entrypoints: [entrypoint],
  external: ["@polkadot/api", "stellar-sdk"],
  format: "esm",
  outdir: resolve(packageRoot, "dist/browser"),
  plugins: [
    {
      name: "browser-storage",
      setup(builder) {
        builder.onLoad({ filter: /storage\.ts$/ }, async args => {
          if (args.path !== nodeStoragePath) return undefined;
          return {
            contents: await Bun.file(resolve(packageRoot, "src/storage.browser.ts")).text(),
            loader: "ts"
          };
        });
      }
    }
  ],
  target: "browser",
  write: true
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
