import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { transformWithEsbuild } from "vite";

// The app's actual JSX and nested JSX imports, with the existing Vite transformer.
const loaded = new Map();
async function jsxModuleUrl(url) {
  if (!loaded.has(url.href)) loaded.set(url.href, (async () => {
    const { code } = await transformWithEsbuild(await readFile(url, "utf8"), fileURLToPath(url), { jsx: "automatic" });
    let rewritten = code;
    for (const [statement, keyword, specifier] of [...code.matchAll(/(from\s+|import\()["']([^"']+)["']/g)]) {
      const target = specifier.endsWith(".jsx") ? await jsxModuleUrl(new URL(specifier, url)) : specifier.startsWith(".") ? new URL(specifier, url).href : import.meta.resolve(specifier);
      rewritten = rewritten.replace(statement, `${keyword}${JSON.stringify(target)}`);
    }
    return `data:text/javascript;base64,${Buffer.from(rewritten).toString("base64")}`;
  })());
  return loaded.get(url.href);
}
export const importJsx = async url => import(await jsxModuleUrl(url));
