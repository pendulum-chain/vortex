import { describe, expect, it } from "bun:test";
import { ApiManager, BrlaApiService, EvmClientManager, getRoute, MykoboApiService } from "@vortexfi/shared";
import QuoteTicket from "../models/quoteTicket.model";
import RampState from "../models/rampState.model";

/**
 * Leak canary: asserts that the process-wide seams other test files patch
 * (model statics, service singletons, global fetch) are pristine when this
 * file runs. The `aaa-` prefix makes it the first file in src/tests/, i.e.
 * after every src/api unit test in bun's discovery order — a patch that was
 * not restored (or not gated behind RUN_LIVE_TESTS) fails here with a message
 * naming the leaked seam instead of poisoning the integration suites below.
 */
describe("leak canary: no test file leaked a singleton patch", () => {
  it("model statics are the real Sequelize implementations", () => {
    for (const [name, fn] of [
      ["QuoteTicket.findByPk", QuoteTicket.findByPk],
      ["QuoteTicket.update", QuoteTicket.update],
      ["RampState.findByPk", RampState.findByPk],
      ["RampState.update", RampState.update]
    ] as const) {
      // bun:test mock() functions carry a `.mock` call-tracking property.
      expect((fn as unknown as { mock?: unknown }).mock, `${name} is a leftover bun mock`).toBeUndefined();
    }
  });

  it("service singleton accessors are the real static methods", () => {
    // The fake world replaces these with anonymous arrows; the real static
    // methods keep their declared names.
    expect(EvmClientManager.getInstance.name, "EvmClientManager.getInstance was left faked").toBe("getInstance");
    expect(BrlaApiService.getInstance.name, "BrlaApiService.getInstance was left faked").toBe("getInstance");
    expect(MykoboApiService.getInstance.name, "MykoboApiService.getInstance was left faked").toBe("getInstance");
    expect(ApiManager.getInstance.name, "ApiManager.getInstance was left faked").toBe("getInstance");
  });

  it("service singletons are real classes, not object-literal module stubs", () => {
    // The name check above misses `{ getInstance: () => … }`: a method shorthand or
    // property arrow in an object literal *infers* the name "getInstance". A leaked
    // mock.module stub of that shape only fails the class-ness check.
    for (const [name, ctor] of [
      ["EvmClientManager", EvmClientManager],
      ["BrlaApiService", BrlaApiService],
      ["MykoboApiService", MykoboApiService],
      ["ApiManager", ApiManager]
    ] as const) {
      expect(typeof ctor, `${name} was replaced by a non-class module stub`).toBe("function");
    }
  });

  it("global fetch is not a leftover fetch guard", () => {
    expect(globalThis.fetch.name, "the fetch guard was left installed").toBe("fetch");
  });

  it("shared getRoute is not a leftover FakeSquidRouter stub", () => {
    // The fake's replacement is an arrow closing over its fakeSquidRouter instance; the
    // name and typeof checks can't tell them apart, but the source can.
    expect(String(getRoute), "getRoute was left pointing at the FakeSquidRouter").not.toContain("fakeSquidRouter");
  });
});
