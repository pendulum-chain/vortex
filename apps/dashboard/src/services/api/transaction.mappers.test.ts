import {
  EPaymentMethod,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection,
  TransactionStatus as WireTransactionStatus
} from "@vortexfi/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapPhaseToStatus } from "./ramp.service";
import { mapRampHistoryTransaction, mapTransactionStatus } from "./transaction.mappers";

describe("mapTransactionStatus", () => {
  it("maps failed ramps to failed", () => {
    assert.equal(mapTransactionStatus({ currentPhase: "failed", status: WireTransactionStatus.FAILED }), "failed");
  });

  it("maps timed-out ramps to cancelled", () => {
    assert.equal(mapTransactionStatus({ currentPhase: "timedOut", status: WireTransactionStatus.FAILED }), "cancelled");
    assert.equal(mapPhaseToStatus("timedOut"), "cancelled");
  });
});

describe("mapRampHistoryTransaction", () => {
  it("maps a BUY ramp without requiring a connected wallet", () => {
    const transaction = mapRampHistoryTransaction(
      {
        currentPhase: "initial",
        date: "2026-07-21T00:00:00.000Z",
        from: EPaymentMethod.PIX,
        fromAmount: "100.00",
        fromCurrency: FiatToken.BRL,
        id: "ramp-buy",
        status: WireTransactionStatus.PENDING,
        to: Networks.Polygon,
        toAmount: "18.20",
        toCurrency: EvmToken.USDC,
        type: RampDirection.BUY,
        walletAddress: "0x1111111111111111111111111111111111111111"
      },
      "account-1"
    );

    assert.equal(transaction?.direction, RampDirection.BUY);
    assert.equal(transaction?.corridorId, "BR");
    assert.equal(transaction?.payinWallet, "0x1111111111111111111111111111111111111111");
    assert.equal(transaction?.amountInToken, "BRL");
    assert.equal(transaction?.payoutCurrency, "USDC");
  });
});
