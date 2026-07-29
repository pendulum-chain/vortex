import { describe, expect, it } from "bun:test";
import { Networks } from "@vortexfi/shared";
import { classifyAlfredpayOfframpSource } from "../phases/alfredpay-offramp/transactions";

describe("Alfredpay offramp source variants", () => {
  it("selects every direct, same-chain Squid, and cross-chain Squid permit topology", () => {
    expect(classifyAlfredpayOfframpSource(Networks.Polygon, true, true)).toBe("direct-permit");
    expect(classifyAlfredpayOfframpSource(Networks.Polygon, true, false)).toBe("direct-no-permit");
    expect(classifyAlfredpayOfframpSource(Networks.Polygon, false, true)).toBe("same-chain-squid-permit");
    expect(classifyAlfredpayOfframpSource(Networks.Polygon, false, false)).toBe("same-chain-squid-no-permit");
    expect(classifyAlfredpayOfframpSource(Networks.Base, false, true)).toBe("cross-chain-squid-permit");
    expect(classifyAlfredpayOfframpSource(Networks.Base, false, false)).toBe("cross-chain-squid-no-permit");
  });
});
