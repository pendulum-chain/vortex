import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { EvmClientManager, EvmToken, FiatToken, multiplyByPowerOfTen, Networks, RampDirection } from "@vortexfi/shared";
import {
  BASE_EPHEMERAL_STARTING_BALANCE_UNITS,
  POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS
} from "../../../../../constants/constants";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import { LEGACY_DESTINATION_EVM_FUNDING_AMOUNTS } from "../core/destination-funding";
import { FundEphemeralExecutor } from "../phases/fund-ephemeral/execution";

const EPHEMERAL = "0x00000000000000000000000000000000000000ee";
const toWei = (units: string) => BigInt(multiplyByPowerOfTen(units, 18).toFixed());
const BASE_RESERVE = toWei(BASE_EPHEMERAL_STARTING_BALANCE_UNITS);
const POLYGON_RESERVE = toWei(POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS);
const DESTINATION_TRANSFER_BUDGET = 7_000_000_000_000n;
const planKey = (network: string) => `${network}:${EPHEMERAL}`;

const gasQuote = (network: string) => ({
  executionFeeUsd: "0.02",
  fundingGasLimit: "21000",
  isNativeTransfer: false,
  maximumFeePerGas: "30000000",
  ...(network === Networks.Base ? { maximumFundingL1FeeRaw: "1", maximumPayoutL1FeeRaw: "1" } : {}),
  network,
  programVersion: 2,
  transferGasLimit: "100000"
});

afterEach(() => mock.restore());

async function run({
  balances = {},
  blockNetwork,
  gasQuoteNetwork,
  plan = {},
  rampType,
  source,
  to
}: {
  balances?: Record<string, bigint>;
  blockNetwork: string;
  gasQuoteNetwork?: string;
  plan?: Record<string, bigint>;
  rampType: RampDirection;
  source?: Record<string, unknown>;
  to: string;
}) {
  spyOn(QuoteTicket, "findByPk").mockResolvedValue({
    metadata: {
      blocks: { fundEphemeral: { network: blockNetwork, token: EvmToken.USDC }, ...source },
      globals: {
        ...(gasQuoteNetwork ? { evmDestinationGas: gasQuote(gasQuoteNetwork) } : {}),
        fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" } },
        partner: null,
        request: {}
      }
    },
    outputCurrency: FiatToken.BRL
  } as never);
  spyOn(EvmClientManager, "getInstance").mockReturnValue({
    getClient: (network: string) => ({
      chain: { nativeCurrency: { decimals: 18 } },
      getBalance: async () => balances[network] ?? 0n
    })
  } as never);

  const executor = new FundEphemeralExecutor() as unknown as {
    executePhase(state: unknown): Promise<unknown>;
    fundDestinationEvmEphemeralAccount: unknown;
    fundEvmEphemeralAccount: unknown;
    fundLegacyDestinationEvmEphemeralAccount: unknown;
    getDestinationEvmFundingRequirementRaw: unknown;
  };
  const funded: Array<[string, string, bigint]> = [];
  executor.fundEvmEphemeralAccount = async (_s: unknown, network: string, required: bigint) => {
    funded.push(["source", network, required]);
  };
  executor.fundDestinationEvmEphemeralAccount = async (_s: unknown, network: string, required: bigint) => {
    funded.push(["destination", network, required]);
  };
  executor.fundLegacyDestinationEvmEphemeralAccount = async (_s: unknown, network: string, required: bigint) => {
    funded.push(["legacy", network, required]);
  };
  executor.getDestinationEvmFundingRequirementRaw = async () => DESTINATION_TRANSFER_BUDGET;

  await executor.executePhase({
    from: blockNetwork,
    quoteId: "quote-1",
    state: {
      evmEphemeralAddress: EPHEMERAL,
      isDirectTransfer: false,
      transactionPlan: {
        nativePrefunding: Object.fromEntries(Object.entries(plan).map(([network, value]) => [planKey(network), value.toString()]))
      }
    },
    to,
    type: rampType,
    unsignedTxs: []
  });
  return funded;
}

describe("FundEphemeral selling from Robinhood Chain", () => {
  const sell = { blockNetwork: Networks.Robinhood, rampType: RampDirection.SELL, to: "pix" };

  it("funds exactly the plan on Robinhood Chain and the standard reserve on Base", async () => {
    expect(await run({ ...sell, plan: { [Networks.Robinhood]: 900n } })).toEqual([
      ["source", Networks.Robinhood, 900n],
      ["legacy", Networks.Base, BASE_RESERVE]
    ]);
  });

  it("adds no dust reserve when nothing is planned", async () => {
    expect(await run({ ...sell })).toEqual([["legacy", Networks.Base, BASE_RESERVE]]);
  });

  it("skips whatever an earlier attempt already funded", async () => {
    expect(
      await run({
        ...sell,
        balances: { [Networks.Base]: BASE_RESERVE, [Networks.Robinhood]: 900n },
        plan: { [Networks.Robinhood]: 900n }
      })
    ).toEqual([]);
  });

  it("adds what the plan declares on Base", async () => {
    expect(await run({ ...sell, plan: { [Networks.Base]: 5n, [Networks.Robinhood]: 900n } })).toEqual([
      ["source", Networks.Robinhood, 900n],
      ["legacy", Networks.Base, BASE_RESERVE + 5n]
    ]);
  });
});

describe("FundEphemeral buying into Robinhood Chain", () => {
  const buy = {
    blockNetwork: Networks.Base,
    plan: { [Networks.Base]: 11n, [Networks.Robinhood]: 900n },
    rampType: RampDirection.BUY,
    to: Networks.Robinhood
  };

  it("adds the Robinhood Chain plan to the signed payout budget under a gas quote", async () => {
    expect(await run({ ...buy, gasQuoteNetwork: Networks.Robinhood })).toEqual([
      ["source", Networks.Base, BASE_RESERVE + 11n],
      ["destination", Networks.Robinhood, DESTINATION_TRANSFER_BUDGET + 900n]
    ]);
  });

  it("adds it to the legacy amount without a gas quote", async () => {
    expect(await run({ ...buy })).toEqual([
      ["source", Networks.Base, BASE_RESERVE + 11n],
      ["legacy", Networks.Robinhood, toWei(LEGACY_DESTINATION_EVM_FUNDING_AMOUNTS[Networks.Robinhood]) + 900n]
    ]);
  });

  it("counts the plan against what the destination already holds", async () => {
    expect(
      await run({
        ...buy,
        balances: {
          [Networks.Base]: BASE_RESERVE + 11n,
          [Networks.Robinhood]: DESTINATION_TRANSFER_BUDGET + 900n
        },
        gasQuoteNetwork: Networks.Robinhood
      })
    ).toEqual([]);
  });
});

describe("FundEphemeral leaves every existing flow's funding unchanged", () => {
  it("cross-chain buy with a gas quote: fixed plus source plan, and the signed payout budget alone", async () => {
    expect(
      await run({
        blockNetwork: Networks.Base,
        gasQuoteNetwork: Networks.Polygon,
        plan: { [Networks.Base]: 11n },
        rampType: RampDirection.BUY,
        to: Networks.Polygon
      })
    ).toEqual([
      ["source", Networks.Base, BASE_RESERVE + 11n],
      ["destination", Networks.Polygon, DESTINATION_TRANSFER_BUDGET]
    ]);
  });

  it("cross-chain buy without a gas quote: the legacy amount alone", async () => {
    expect(
      await run({
        blockNetwork: Networks.Base,
        plan: { [Networks.Base]: 11n },
        rampType: RampDirection.BUY,
        to: Networks.Arbitrum
      })
    ).toEqual([
      ["source", Networks.Base, BASE_RESERVE + 11n],
      ["legacy", Networks.Arbitrum, toWei(LEGACY_DESTINATION_EVM_FUNDING_AMOUNTS[Networks.Arbitrum])]
    ]);
  });

  it("same-chain buy with a gas quote: the source plan is counted once, with the payout budget additive", async () => {
    expect(
      await run({
        blockNetwork: Networks.Base,
        gasQuoteNetwork: Networks.Base,
        plan: { [Networks.Base]: 11n },
        rampType: RampDirection.BUY,
        to: Networks.Base
      })
    ).toEqual([["source", Networks.Base, BASE_RESERVE + 11n + DESTINATION_TRANSFER_BUDGET]]);
  });

  it("same-chain Polygon buy without a gas quote: the plan does not grow the legacy check", async () => {
    expect(
      await run({
        balances: { [Networks.Polygon]: toWei(LEGACY_DESTINATION_EVM_FUNDING_AMOUNTS[Networks.Polygon]) },
        blockNetwork: Networks.Polygon,
        plan: { [Networks.Polygon]: 11n },
        rampType: RampDirection.BUY,
        to: Networks.Polygon
      })
    ).toEqual([["source", Networks.Polygon, POLYGON_RESERVE + 11n]]);
  });

  it("Base-routed sell: no second network is funded", async () => {
    expect(
      await run({
        blockNetwork: Networks.Base,
        plan: { [Networks.Base]: 11n },
        rampType: RampDirection.SELL,
        source: {
          evmOfframpSource: { fromNetwork: Networks.Arbitrum, network: Networks.Base, token: EvmToken.USDC }
        },
        to: "pix"
      })
    ).toEqual([["source", Networks.Base, BASE_RESERVE + 11n]]);
  });
});
