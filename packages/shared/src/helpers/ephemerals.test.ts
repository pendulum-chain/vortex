import { describe, expect, it } from "bun:test";
describe("createMoonbeamEphemeral", () => {
  it("returns the address derived from its private key before Polkadot crypto initialization", async () => {
    const child = Bun.spawn({
      cmd: [
        process.execPath,
        "-e",
        `
          import { privateKeyToAccount } from "viem/accounts";
          import { createMoonbeamEphemeral } from "./ephemerals.ts";

          const ephemeral = createMoonbeamEphemeral();
          const derivedAddress = privateKeyToAccount(ephemeral.secret).address;

          if (ephemeral.address.toLowerCase() !== derivedAddress.toLowerCase()) {
            throw new Error(\`Generated address \${ephemeral.address} does not match \${derivedAddress}\`);
          }
        `
      ],
      cwd: import.meta.dir,
      stderr: "pipe"
    });

    expect(await child.exited).toBe(0);
  });
});
