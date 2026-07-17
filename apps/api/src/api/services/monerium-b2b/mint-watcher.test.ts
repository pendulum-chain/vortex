import { describe, expect, it } from "bun:test";
import { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import {
  MatchableDeposit,
  matchMintLogToDeposit,
  syntheticUnattributedOrderId,
  UNATTRIBUTED_ORDER_PREFIX
} from "./mint-watcher";

// Mint-log -> deposit matching (plan §3, "mint detection"). Pure decision logic; the
// database write path shares the advisory-locked transaction with the webhook processor.

const { Held, Minted, Pending, Returned } = MoneriumFiatDepositStatus;

const TX_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function candidate(overrides: Partial<MatchableDeposit> & { id: string }): MatchableDeposit {
  return {
    amountRaw: (100n * 10n ** 18n).toString(),
    logIndex: null,
    status: Pending,
    txHash: null,
    ...overrides
  } as MatchableDeposit;
}

describe("matchMintLogToDeposit", () => {
  it("matches by tx hash when the webhook already recorded the mint hash (case-insensitive)", () => {
    const deposits = [
      candidate({ id: "other" }),
      candidate({ id: "hash-match", status: Minted, txHash: TX_A.toLowerCase() })
    ];
    const match = matchMintLogToDeposit({ txHash: TX_A, valueRaw: 5n }, deposits);
    expect(match?.id).toBe("hash-match");
  });

  it("matches the oldest pending deposit with the exact mint amount", () => {
    const amount = 250n * 10n ** 18n;
    const deposits = [
      candidate({ amountRaw: (100n * 10n ** 18n).toString(), id: "wrong-amount" }),
      candidate({ amountRaw: amount.toString(), id: "older" }),
      candidate({ amountRaw: amount.toString(), id: "newer" })
    ];
    const match = matchMintLogToDeposit({ txHash: TX_A, valueRaw: amount }, deposits);
    expect(match?.id).toBe("older");
  });

  it("returns null when nothing matches (unattributed fallback)", () => {
    const deposits = [candidate({ amountRaw: "100", id: "a" })];
    expect(matchMintLogToDeposit({ txHash: TX_A, valueRaw: 999n }, deposits)).toBeNull();
    expect(matchMintLogToDeposit({ txHash: TX_A, valueRaw: 999n }, [])).toBeNull();
  });

  it("never matches deposits that already carry mint fields", () => {
    const amount = 100n * 10n ** 18n;
    const deposits = [candidate({ amountRaw: amount.toString(), id: "already-recorded", logIndex: 3 })];
    expect(matchMintLogToDeposit({ txHash: TX_A, valueRaw: amount }, deposits)).toBeNull();
  });

  it("never matches held or returned orders (they have not minted)", () => {
    const amount = 100n * 10n ** 18n;
    const deposits = [
      candidate({ amountRaw: amount.toString(), id: "held", status: Held }),
      candidate({ amountRaw: amount.toString(), id: "returned", status: Returned })
    ];
    expect(matchMintLogToDeposit({ txHash: TX_A, valueRaw: amount }, deposits)).toBeNull();
  });

  it("does not amount-match a minted deposit without a hash (hash is required once minted)", () => {
    // A webhook-minted order without meta.txHash cannot be safely claimed by amount
    // alone once it is already minted — only pending orders amount-match.
    const amount = 100n * 10n ** 18n;
    const deposits = [candidate({ amountRaw: amount.toString(), id: "minted-no-hash", status: Minted })];
    expect(matchMintLogToDeposit({ txHash: TX_A, valueRaw: amount }, deposits)).toBeNull();
  });
});

describe("syntheticUnattributedOrderId", () => {
  it("is deterministic, flagged, and fits the 64-char order-id column", () => {
    const id = syntheticUnattributedOrderId(1, TX_A, 7);
    expect(id).toBe(syntheticUnattributedOrderId(1, TX_A.toLowerCase(), 7));
    expect(id.startsWith(UNATTRIBUTED_ORDER_PREFIX)).toBe(true);
    expect(id.length).toBeLessThanOrEqual(64);
  });

  it("differs per chain, transaction, and log index", () => {
    const base = syntheticUnattributedOrderId(1, TX_A, 7);
    expect(syntheticUnattributedOrderId(2, TX_A, 7)).not.toBe(base);
    expect(syntheticUnattributedOrderId(1, TX_A, 8)).not.toBe(base);
  });
});
