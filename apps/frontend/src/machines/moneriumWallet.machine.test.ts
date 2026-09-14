import type { MoneriumRampReadiness, MoneriumStatusResponse } from "@vortexfi/kyc";
import { describe, expect, it, vi } from "vitest";
import { createActor, waitFor } from "xstate";
import { createMoneriumWalletMachine, type MoneriumWalletInput } from "./moneriumWallet.machine";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

function status(ramp: Partial<MoneriumRampReadiness> | null, rampError?: { code: string; message: string }): MoneriumStatusResponse {
  return {
    customerType: "individual",
    profileId: "profile-1",
    ...(ramp ? { ramp: { chain: "polygon", iban: "missing", linkedAddress: null, source: "oauth", ...ramp } } : {}),
    ...(rampError ? { rampError } : {}),
    status: "APPROVED",
    statusExternal: "approved"
  };
}

function input(overrides: Partial<MoneriumWalletInput> = {}): MoneriumWalletInput {
  return { address: ADDRESS, customerType: "individual", isEvmWallet: true, signMessage: async () => "0xsig", ...overrides };
}

function api(statuses: MoneriumStatusResponse[]) {
  const calls = { link: 0, move: 0 };
  return {
    api: {
      getStatus: vi.fn(async () => statuses.length > 1 ? (statuses.shift() as MoneriumStatusResponse) : statuses[0]),
      linkWallet: vi.fn(async () => {
        calls.link += 1;
        return { address: ADDRESS, chain: "polygon", iban: "pending" as const };
      }),
      moveIban: vi.fn(async () => {
        calls.move += 1;
        return { address: ADDRESS, chain: "polygon", iban: "provisioned" as const };
      })
    },
    calls
  };
}

describe("moneriumWalletMachine", () => {
  it("finishes immediately when the IBAN already points to the connected wallet", async () => {
    const { api: client, calls } = api([status({ iban: "provisioned", linkedAddress: ADDRESS })]);
    const actor = createActor(createMoneriumWalletMachine(client), { input: input() }).start();
    await waitFor(actor, snapshot => snapshot.status === "done");
    expect(actor.getSnapshot().output).toEqual({ error: undefined, ready: true });
    expect(calls.link).toBe(0);
  });

  it("links the wallet, waits for provisioning, and finishes once the IBAN lands", async () => {
    vi.useFakeTimers();
    try {
      const { api: client, calls } = api([
        status({ iban: "missing" }),
        status({ iban: "missing", linkedAddress: ADDRESS }),
        status({ iban: "provisioned", linkedAddress: ADDRESS })
      ]);
      const actor = createActor(createMoneriumWalletMachine(client), { input: input() }).start();
      await waitFor(actor, snapshot => snapshot.matches("Waiting"));
      expect(calls.link).toBe(1);
      expect(client.linkWallet).toHaveBeenCalledWith({ address: ADDRESS, chain: "polygon", signature: "0xsig" });
      await vi.advanceTimersByTimeAsync(5_000);
      await waitFor(actor, snapshot => snapshot.status === "done");
      expect(actor.getSnapshot().output?.ready).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks before moving an IBAN that sits on another wallet", async () => {
    const { api: client, calls } = api([
      status({ iban: "elsewhere", linkedAddress: ADDRESS }),
      status({ iban: "provisioned", linkedAddress: ADDRESS })
    ]);
    const actor = createActor(createMoneriumWalletMachine(client), { input: input() }).start();
    await waitFor(actor, snapshot => snapshot.matches("NeedsMove"));
    expect(calls.move).toBe(0);
    actor.send({ type: "CONFIRM_MOVE" });
    await waitFor(actor, snapshot => snapshot.status === "done");
    expect(calls.move).toBe(1);
    expect(actor.getSnapshot().output?.ready).toBe(true);
  });

  it("treats a provisioned IBAN on a different wallet as movable after linking this one", async () => {
    const { api: client, calls } = api([
      status({ iban: "provisioned", linkedAddress: OTHER }),
      status({ iban: "provisioned", linkedAddress: OTHER }),
      status({ iban: "provisioned", linkedAddress: ADDRESS })
    ]);
    const actor = createActor(createMoneriumWalletMachine(client), { input: input() }).start();
    await waitFor(actor, snapshot => snapshot.matches("NeedsMove"));
    expect(calls.link).toBe(1);
    actor.send({ type: "CONFIRM_MOVE" });
    await waitFor(actor, snapshot => snapshot.status === "done");
    expect(actor.getSnapshot().output?.ready).toBe(true);
  });

  it("surfaces a lost Monerium session and retries on request", async () => {
    const { api: client } = api([status(null, { code: "MONERIUM_REAUTHENTICATION_REQUIRED", message: "Monerium reauthentication is required" })]);
    const actor = createActor(createMoneriumWalletMachine(client), { input: input() }).start();
    await waitFor(actor, snapshot => snapshot.matches("Failure"));
    expect(actor.getSnapshot().context.error).toContain("reauthentication");
    actor.send({ type: "CANCEL" });
    await waitFor(actor, snapshot => snapshot.status === "done");
    expect(actor.getSnapshot().output?.ready).toBe(false);
  });

  it("refuses a substrate wallet without calling Monerium", async () => {
    const { api: client } = api([status({ iban: "missing" })]);
    const actor = createActor(createMoneriumWalletMachine(client), { input: input({ isEvmWallet: false }) }).start();
    await waitFor(actor, snapshot => snapshot.status === "done");
    expect(actor.getSnapshot().output).toEqual({ error: "Connect an EVM wallet to receive EUR", ready: false });
    expect(client.getStatus).not.toHaveBeenCalled();
  });
});
