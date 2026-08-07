import { describe, expect, it } from "bun:test";
import { makeVortexTypedDataFixtures, toCdpTypedData } from "./vortexTypedData";

const OWNER = "0x5555555555555555555555555555555555555555";

describe("Vortex to CDP typed-data conversion", () => {
  it("adds CDP's explicit standard EIP712Domain without changing Vortex types", () => {
    const fixture = makeVortexTypedDataFixtures(OWNER)[0];
    if (!fixture) throw new Error("Missing fixture");

    const converted = toCdpTypedData(fixture);

    expect(converted.types.EIP712Domain).toEqual([
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" }
    ]);
    expect(fixture.types).not.toHaveProperty("EIP712Domain");
    expect(converted.message).toBe(fixture.message);
  });

  it("uses the salt-based domain shape emitted for non-standard ERC-20 permits", () => {
    const fixture = makeVortexTypedDataFixtures(OWNER)[1];
    if (!fixture) throw new Error("Missing fixture");

    expect(toCdpTypedData(fixture).types.EIP712Domain).toEqual([
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "verifyingContract", type: "address" },
      { name: "salt", type: "bytes32" }
    ]);
  });

  it("covers every typed-data family the spike must exercise", () => {
    expect(makeVortexTypedDataFixtures(OWNER).map(fixture => fixture.name)).toEqual([
      "ERC-20 permit",
      "Salted ERC-20 permit",
      "TokenRelayer payload",
      "Permit2 transfer"
    ]);
  });
});
