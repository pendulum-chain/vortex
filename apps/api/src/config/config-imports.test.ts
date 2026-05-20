import {describe, expect, it} from "bun:test";
import {readdirSync, readFileSync, statSync} from "node:fs";
import path from "node:path";

const sourceRoot = path.resolve(import.meta.dir, "..");
const configBarrelImportPattern =
  /\bfrom\s+["'](?:\.\/config|(?:\.\.\/)+config)["']|\brequire\(["'](?:\.\/config|(?:\.\.\/)+config)["']\)/;

function collectRuntimeTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(entry => {
    const entryPath = path.join(directory, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      if (entry === "config") {
        return [];
      }
      return collectRuntimeTypeScriptFiles(entryPath);
    }

    if (!entryPath.endsWith(".ts") || entryPath.endsWith(".test.ts")) {
      return [];
    }

    return [entryPath];
  });
}

describe("config imports", () => {
  it("keeps runtime modules from importing the config barrel", () => {
    const offenders = collectRuntimeTypeScriptFiles(sourceRoot)
      .filter(filePath => configBarrelImportPattern.test(readFileSync(filePath, "utf8")))
      .map(filePath => path.relative(sourceRoot, filePath));

    expect(offenders).toEqual([]);
  });
});
