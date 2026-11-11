import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
const command = config.match(/^\s*command\s*=\s*"(.*)"\s*$/m)?.[1] ?? "";
const publishStep = command.slice(command.indexOf("mkdir -p"));
const ENGLISH_PAGE = "apps/frontend/dist/client/en/stocks/index.html";

// Runs the part of the build command that assembles the published tree, over fake build output.
function publish(files: string[]) {
  const root = mkdtempSync(join(tmpdir(), "netlify-publish-"));
  try {
    for (const file of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), "");
    }
    execFileSync("sh", ["-c", publishStep], { cwd: root, stdio: "pipe" });
    return (path: string) => existsSync(join(root, path));
  } catch (error) {
    rmSync(root, { force: true, recursive: true });
    throw error;
  }
}

const OUTPUT = ["apps/gold/dist/client/index.html", "apps/stocks/dist/client/index.html"];

describe("Netlify build settings", () => {
  // The ignore check reads a missing build cache as "no change", so a deployed branch using it can stop deploying for good.
  it.each(["production", "staging"])("never skips a build of %s", context => {
    expect(config).toContain(`[context.${context}]\n  ignore = "/bin/false"\n`);
  });

  it("builds with the Bun version the repo pins", () => {
    const pinned = readFileSync(new URL("../../../../.bun-version", import.meta.url), "utf8").trim();
    expect(config).toContain(`BUN_VERSION = "${pinned}"`);
  });
});

describe("Netlify build command", () => {
  it("publishes a live Stocks build, which has no English page", () => {
    const published = publish(OUTPUT);
    expect(published("apps/frontend/dist/client/pt-BR/gold/index.html")).toBe(true);
    expect(published("apps/frontend/dist/client/pt-BR/stocks/index.html")).toBe(true);
    expect(published(ENGLISH_PAGE)).toBe(false);
  });

  it("publishes the English page when a non-live build emitted it", () => {
    const published = publish([...OUTPUT, "apps/stocks/dist/client/international.html"]);
    expect(published(ENGLISH_PAGE)).toBe(true);
  });
});
