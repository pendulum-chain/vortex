import { expect, it } from "bun:test";
import { join } from "path";

// bun restores a spied method when its test file ends but keeps the spy's call history: a
// later file's spyOn() on the same method then starts with calls that file never made.
it("every test file that installs spyOn() spies restores them", async () => {
  const root = join(import.meta.dir, "..");
  const offenders: string[] = [];
  for await (const path of new Bun.Glob("**/*.test.ts").scan(root)) {
    const file = join(root, path);
    if (file === import.meta.path) continue;
    const source = await Bun.file(file).text();
    if (source.includes("spyOn(") && !/mock\.restore\(\)|\.mockRestore\(\)/.test(source)) {
      offenders.push(path);
    }
  }
  expect(offenders).toEqual([]);
});
