import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MoneriumRampReadiness, MoneriumWalletLinkResult } from "@vortexfi/kyc";
import {
  MONERIUM_STATUS_MAX_POLLS,
  MONERIUM_STATUS_POLL_INTERVAL_MS,
  moneriumStatusPollInterval,
  moneriumWalletLinkRequired,
  moneriumWalletStep
} from "./walletStep";

const OLD = "0x1111111111111111111111111111111111111111";
const NEW = "0x2222222222222222222222222222222222222222";
const ramp: MoneriumRampReadiness = { chain: "polygon", iban: "provisioned", linkedAddress: OLD, source: "oauth" };

describe("Monerium wallet step", () => {
  it("does not show ready when a different wallet is connected to a provisioned IBAN", () => {
    assert.equal(moneriumWalletStep(ramp, NEW, undefined), "link");
  });

  it("asks before moving the IBAN after linking the new wallet", () => {
    const linked: MoneriumWalletLinkResult = { address: NEW, chain: "polygon", iban: "elsewhere" };
    assert.equal(moneriumWalletStep(ramp, NEW, linked), "move");
    assert.equal(moneriumWalletStep({ ...ramp, iban: "elsewhere" }, NEW, linked), "move");
  });

  it("shows ready only when the connected wallet receives the IBAN's deposits", () => {
    assert.equal(moneriumWalletStep(ramp, OLD, undefined), "ready");
    assert.equal(moneriumWalletStep({ ...ramp, linkedAddress: NEW }, NEW, undefined), "ready");
  });
});

describe("Monerium status polling", () => {
  const pending: MoneriumRampReadiness = { ...ramp, iban: "missing", linkedAddress: null };

  it("polls while the IBAN is not provisioned to the connected wallet", () => {
    assert.equal(
      moneriumStatusPollInterval({ address: NEW, error: null, polls: 3, ramp: pending }),
      MONERIUM_STATUS_POLL_INTERVAL_MS
    );
    assert.equal(moneriumStatusPollInterval({ address: NEW, error: null, polls: 3, ramp }), MONERIUM_STATUS_POLL_INTERVAL_MS);
    assert.equal(moneriumStatusPollInterval({ address: OLD, error: null, polls: 3, ramp }), false);
  });

  it("stops on an error or without a wallet", () => {
    assert.equal(moneriumStatusPollInterval({ address: NEW, error: new Error("boom"), polls: 0, ramp: pending }), false);
    assert.equal(moneriumStatusPollInterval({ address: undefined, error: null, polls: 0, ramp: pending }), false);
  });

  it("gives up after the same bound as the widget instead of polling forever", () => {
    assert.equal(
      moneriumStatusPollInterval({ address: NEW, error: null, polls: MONERIUM_STATUS_MAX_POLLS - 1, ramp: pending }),
      MONERIUM_STATUS_POLL_INTERVAL_MS
    );
    assert.equal(moneriumStatusPollInterval({ address: NEW, error: null, polls: MONERIUM_STATUS_MAX_POLLS, ramp: pending }), false);
  });
});

describe("Monerium wallet link requirement", () => {
  it("yields to reauthentication when readiness could not be read", () => {
    assert.equal(moneriumWalletLinkRequired({ ramp: null, reauthenticationRequired: true, status: "approved" }), false);
    assert.equal(moneriumWalletLinkRequired({ ramp: null, reauthenticationRequired: false, status: "approved" }), true);
    assert.equal(moneriumWalletLinkRequired({ ramp, reauthenticationRequired: false, status: "approved" }), false);
    assert.equal(moneriumWalletLinkRequired({ ramp: null, reauthenticationRequired: false, status: "in_review" }), false);
  });
});
