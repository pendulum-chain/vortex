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
    assert.equal(transaction?.recipientEmail, "Your wallet");
  });

  it("keeps a SELL source wallet separate from its payout destination label", () => {
    const transaction = mapRampHistoryTransaction(
      {
        currentPhase: "complete",
        date: "2026-07-21T00:00:00.000Z",
        from: Networks.Polygon,
        fromAmount: "54.054054",
        fromCurrency: EvmToken.USDC,
        id: "ramp-sell",
        status: WireTransactionStatus.COMPLETE,
        to: EPaymentMethod.SPEI,
        toAmount: "1000.00",
        toCurrency: FiatToken.MXN,
        type: RampDirection.SELL,
        walletAddress: "0x2222222222222222222222222222222222222222"
      },
      "account-1"
    );

    assert.equal(transaction?.direction, RampDirection.SELL);
    assert.equal(transaction?.payinWallet, "0x2222222222222222222222222222222222222222");
    assert.equal(transaction?.recipientEmail, "Payout account");
  });
});
