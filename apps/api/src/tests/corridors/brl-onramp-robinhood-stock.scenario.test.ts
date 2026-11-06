import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as shared from "@vortexfi/shared";
import {
  type CleanupPhase,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  Networks,
  RampDirection,
  type RampPhase,
  RELAY_BASE_USDC_ADDRESS,
  RELAY_DEPOSITORY_ADDRESS,
  RELAY_ROBINHOOD_USDG_ADDRESS,
  signUnsignedTransactions,
  type UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { decodeFunctionData, formatEther, formatUnits, keccak256, parseAbi, parseEther, parseTransaction, parseUnits } from "viem";
import { generatePrivateKey, type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { getEvmFundingAccount } from "../../api/services/phases/blocks/core/evm-funding";
import { getBlockMetadata } from "../../api/services/phases/blocks/core/metadata";
import { ROBINHOOD_STOCKS, type StockSymbol } from "../../api/services/phases/blocks/core/robinhood-stocks";
import { AveniaMintContext } from "../../api/services/phases/blocks/phases/avenia-mint/simulation";
import { DistributeFeesContext } from "../../api/services/phases/blocks/phases/distribute-fees/simulation";
import { NablaSwapContext } from "../../api/services/phases/blocks/phases/nabla-swap/simulation";
import { StockRouteContext } from "../../api/services/phases/blocks/phases/stock-route/simulation";
import { StockSettlementContext } from "../../api/services/phases/blocks/phases/stock-settlement/simulation";
import phaseProcessor from "../../api/services/phases/phase-processor";
import baseChainPostProcessHandler from "../../api/services/phases/post-process/base-chain-post-process-handler";
import robinhoodPostProcessHandler from "../../api/services/phases/post-process/robinhood-post-process-handler";
import RampRecoveryWorker from "../../api/workers/ramp-recovery.worker";
import UnhandledPaymentWorker from "../../api/workers/unhandled-payment.worker";
import sequelize from "../../config/database";
import { config } from "../../config/vars";
import { up as seedStocksPartner } from "../../database/migrations/089-add-stocks-partner";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import Subsidy from "../../models/subsidy.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestTaxId, createTestUser, updatePartnerPricing } from "../../test-utils/factories";
import { type FakeWorld, installFakeChainIdRpc, installFakeWorld } from "../../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../../test-utils/fake-world/fake-auth";
import { scriptRobinhoodChain, TokenLedger } from "../../test-utils/fake-world/robinhood-chain";
import { startTestApp, type TestApp } from "../../test-utils/test-app";

// The fake chain prices every stock alike, so a scenario changes only the symbol.
const NVDA_USD = 181n;
const NVDA_ON_ROBINHOOD = ROBINHOOD_STOCKS.NVDA.address;
const USDC_ON_BASE = RELAY_BASE_USDC_ADDRESS;
const USDG_ON_ROBINHOOD = RELAY_ROBINHOOD_USDG_ADDRESS;
const BRLA_ON_BASE = evmTokenConfig[Networks.Base][EvmToken.BRLA]?.erc20AddressSourceChain as `0x${string}`;
const TAX_ID = "12345678901";
const FUNDING = getEvmFundingAccount(Networks.Robinhood).address;
const FEE_PAYOUT = "0x000000000000000000000000000000000000fee5";
const DEPOSIT_ERC20_ABI = parseAbi(["function depositErc20(address depositor, address token, uint256 amount, bytes32 id)"]);

const HAPPY_PATH_PHASES: RampPhase[] = [
  "initial",
  "brlaOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "distributeFees",
  "subsidizePostSwap",
  "relayBridge",
  "uniswapApprove",
  "uniswapSwap",
  "stockSettlementTopUp",
  "destinationTransfer",
  "gasReserveTopUp",
  "complete"
];

interface BuySetup {
  /** The exact stock amount the quote promised. */
  amountRaw: bigint;
  destination: `0x${string}`;
  ephemeral: PrivateKeyAccount;
  /** USDC the fee distribution pays out on Base. */
  feesRaw: bigint;
  /** What the Relay order delivers on Robinhood Chain. */
  fillRaw: bigint;
  ledger: TokenLedger;
  maxSubsidyUsd: string;
  /** What Avenia sends the ephemeral, in whole cents of BRLA. */
  mintedRaw: bigint;
  nablaInputRaw: bigint;
  nablaOutputRaw: bigint;
  quoteId: string;
  rampId: string;
  signed: Partial<Record<RampPhase | CleanupPhase, `0x${string}`>>;
  stock: `0x${string}`;
  userId: string;
}

/**
 * Corridor scenario tests for a stock BUY (Pix → BRLA on Base → Nabla → USDC → Relay → USDG on Robinhood Chain →
 * Uniswap → the promised stock amount → the buyer's wallet, plus an ETH reserve). Quote, registration, presign
 * validation and start go through the real HTTP API with the shared signer, then the REAL PhaseProcessor drives the
 * real executors. Only the world is fake, and it enforces token semantics, nonces and gas (see TokenLedger).
 */
describe("BRL onramp to a Robinhood Chain stock", () => {
  let world: FakeWorld;
  let auth: { restore: () => void };
  let restoreChainIdRpc: () => void;
  let app: TestApp;
  const enabledDirections = config.stocks.enabledDirections;

  beforeAll(async () => {
    world = installFakeWorld();
    restoreChainIdRpc = installFakeChainIdRpc();
    auth = installFakeSupabaseAuth();
    await setupTestDatabase();
    app = await startTestApp();
  });

  afterAll(async () => {
    config.stocks.enabledDirections = enabledDirections;
    await app?.close();
    auth?.restore();
    restoreChainIdRpc?.();
    world?.restore();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    await seedStocksPartner(sequelize.getQueryInterface());
    // The fee distribution pays the vortex partner's EVM address.
    await updatePartnerPricing("vortex", RampDirection.BUY, { payoutAddressEvm: FEE_PAYOUT });
    config.stocks.enabledDirections = [RampDirection.BUY, RampDirection.SELL];
    world.evm.strictReceipts = true;
    world.evm.failNextSends = 0;
    world.evm.onTransaction = undefined;
    world.evm.revertedReceiptHashes.clear();
    world.evm.sentTransactions.length = 0;
    // Live orders of magnitude: 0.0065 gwei on Base, 0.03 gwei on Robinhood Chain.
    world.evm.setFeeEstimate(Networks.Base, 6_500_000n, 1_000_000n);
    world.evm.setFeeEstimate(Networks.Robinhood, 30_000_000n, 0n);
    world.evm.setNativeBalance(Networks.Base, FUNDING, parseEther("10"));
    world.evm.setNativeBalance(Networks.Robinhood, FUNDING, parseEther("10"));
    world.evm.setErc20Balance(Networks.Robinhood, NVDA_ON_ROBINHOOD, FUNDING, 0n);
    world.evm.setErc20Balance(Networks.Robinhood, USDG_ON_ROBINHOOD, FUNDING, 0n);
    world.evm.setErc20Balance(Networks.Base, USDC_ON_BASE, FEE_PAYOUT, 0n);
    world.brla.onPixOutputTicket = undefined;
    world.brla.accountBalances = { BRLA: 1_000_000, USDC: 0, USDM: 0, USDT: 0 };
    world.relay.statusRequests.length = 0;
    world.relay.statusScript.length = 0;
    world.relay.onStatusPoll = undefined;
    world.relay.nextStatusFault = null;
    world.relay.nextQuoteFault = null;
    world.relay.feeBps = 6n;
    world.relay.finalStatus = { inTxHashes: [`0x${"aa".repeat(32)}`], status: "success", txHashes: [`0x${"bb".repeat(32)}`] };
    world.evm.onReadContract = (_network, params) => {
      if (params.functionName !== "quoteSwapExactTokensForTokens") return undefined;
      return (params.args?.[0] as bigint) / 5n / 10n ** 12n;
    };
    scriptRobinhoodChain(world.evm, NVDA_USD);
  });

  const jsonHeaders = (userId?: string) => ({
    ...(userId ? { Authorization: `Bearer ${testUserToken(userId)}` } : {}),
    "Content-Type": "application/json"
  });

  async function post<Body>(path: string, body: unknown, userId?: string): Promise<Body> {
    const response = await app.request(path, { body: JSON.stringify(body), headers: jsonHeaders(userId), method: "POST" });
    expect(response.status, `${path} failed: ${await response.clone().text()}`).toBeLessThan(300);
    return (await response.json()) as Body;
  }

  /** Quote, registration through the real hooks, and every ephemeral blueprint through the shared signer and /v1/ramp/update. */
  async function setUpRegisteredRamp(
    { inputAmount = "500", token = EvmToken.NVDA }: { inputAmount?: string; token?: StockSymbol } = {}
  ): Promise<BuySetup> {
    const ephemeralSecret = generatePrivateKey();
    const ephemeral = privateKeyToAccount(ephemeralSecret);
    const destination = privateKeyToAccount(generatePrivateKey()).address;
    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });

    const quote = await post<{ id: string; outputAmount: string }>("/v1/quotes", {
      destinationAddress: destination,
      from: "pix",
      inputAmount,
      inputCurrency: FiatToken.BRL,
      network: Networks.Robinhood,
      outputCurrency: token,
      rampType: RampDirection.BUY,
      to: Networks.Robinhood
    });
    const registered = await post<{ id: string; unsignedTxs: UnsignedTx[] }>(
      "/v1/ramp/register",
      {
        additionalData: { destinationAddress: destination, taxId: TAX_ID },
        quoteId: quote.id,
        signingAccounts: [{ address: ephemeral.address, type: "EVM" }]
      },
      user.id
    );

    const persistedQuote = (await QuoteTicket.findByPk(quote.id)) as QuoteTicket;
    const settlement = getBlockMetadata(persistedQuote.metadata, StockSettlementContext);
    const route = getBlockMetadata(persistedQuote.metadata, StockRouteContext);
    const nabla = getBlockMetadata(persistedQuote.metadata, NablaSwapContext);
    const mint = getBlockMetadata(persistedQuote.metadata, AveniaMintContext);
    expect(BigInt(settlement.amountRaw)).toBe(parseUnits(quote.outputAmount, 18));

    const presignedTxs = await signUnsignedTransactions(registered.unsignedTxs, {
      evmEphemeral: { address: ephemeral.address, secret: ephemeralSecret }
    });
    const onRobinhood = presignedTxs.filter(tx => tx.network === Networks.Robinhood);
    expect(onRobinhood.map(tx => tx.phase).sort()).toEqual(
      ["destinationTransfer", "robinhoodCleanupStock", "stockBackupApprove", "uniswapApprove", "uniswapSwap"].sort() as RampPhase[]
    );
    for (const tx of onRobinhood) {
      expect(Object.keys(tx.meta?.additionalTxs ?? {})).toHaveLength(4);
    }

    const updated = await post<{ depositQrCode?: string }>(
      "/v1/ramp/update",
      { presignedTxs, rampId: registered.id },
      user.id
    );
    expect(updated.depositQrCode).toBeTruthy();

    const signed: BuySetup["signed"] = {};
    for (const tx of presignedTxs) signed[tx.phase as RampPhase | CleanupPhase] = tx.txData as `0x${string}`;

    return {
      amountRaw: BigInt(settlement.amountRaw),
      destination,
      ephemeral,
      feesRaw: parseUnits(getBlockMetadata(persistedQuote.metadata, DistributeFeesContext).totalFeesUsd, 6),
      fillRaw: BigInt(route.bridge.outputAmountRaw),
      ledger: new TokenLedger(world.evm, NVDA_USD, ephemeral.address),
      maxSubsidyUsd: settlement.maxSubsidyUsd,
      mintedRaw: parseUnits(new Big(mint.mint.outputAmountDecimal).toFixed(2, 0), 18),
      nablaInputRaw: BigInt(nabla.inputAmountForSwapRaw),
      nablaOutputRaw: BigInt(nabla.outputAmountRaw),
      quoteId: quote.id,
      rampId: registered.id,
      signed,
      stock: ROBINHOOD_STOCKS[token].address,
      userId: user.id
    };
  }

  /**
   * The Pix is paid and Avenia mints to the ephemeral. Broadcasts follow the ledger; on top of it the Nabla swap trades
   * at its quote and the Relay deposit pulls the order's input. The fill reaches the ephemeral right after, unless a
   * scenario delays it through `fillOnPoll`.
   */
  function scriptPaidWorld(setup: BuySetup, options: { fillOnPoll?: number } = {}): void {
    const { ephemeral, ledger, signed } = setup;
    world.brla.onPixOutputTicket = ({ walletAddress }) => {
      if (walletAddress) ledger.credit(Networks.Base, BRLA_ON_BASE, walletAddress, setup.mintedRaw);
    };
    const fill = () => ledger.credit(Networks.Robinhood, USDG_ON_ROBINHOOD, ephemeral.address, setup.fillRaw);
    if (options.fillOnPoll) {
      world.relay.onStatusPoll = poll => {
        if (poll === options.fillOnPoll) fill();
      };
    }
    world.evm.onTransaction = tx => {
      ledger.apply(tx);
      if (tx.serialized === signed.nablaSwap) {
        const router = parseTransaction(tx.serialized as `0x${string}`).to as string;
        if (ledger.pull(tx, BRLA_ON_BASE, ephemeral.address, router, router, setup.nablaInputRaw)) {
          ledger.credit(Networks.Base, USDC_ON_BASE, ephemeral.address, setup.nablaOutputRaw);
        }
      }
      if (tx.serialized === signed.relayBridge) {
        const { args } = decodeFunctionData({
          abi: DEPOSIT_ERC20_ABI,
          data: parseTransaction(tx.serialized as `0x${string}`).data as `0x${string}`
        });
        const deposited = ledger.pull(
          tx,
          USDC_ON_BASE,
          ephemeral.address,
          RELAY_DEPOSITORY_ADDRESS,
          RELAY_DEPOSITORY_ADDRESS,
          args[2]
        );
        if (deposited && !options.fillOnPoll) fill();
      }
    };
  }

  async function startAndSettle(setup: BuySetup): Promise<RampState> {
    await post("/v1/ramp/start", { rampId: setup.rampId }, setup.userId);
    return settled(setup);
  }

  async function settled(setup: BuySetup): Promise<RampState> {
    const deadline = Date.now() + 60_000;
    for (;;) {
      const ramp = (await RampState.findByPk(setup.rampId)) as RampState;
      if (ramp.currentPhase !== "initial" && !ramp.processingLock.locked) return ramp;
      if (Date.now() > deadline) throw new Error(`Ramp stuck in ${ramp.currentPhase}`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }

  const stockOf = (holder: string, stock = NVDA_ON_ROBINHOOD) => world.evm.erc20Balance(Networks.Robinhood, stock, holder);
  const usdgOf = (holder: string) => world.evm.erc20Balance(Networks.Robinhood, USDG_ON_ROBINHOOD, holder);
  const submissionsOf = (signedTx?: string) => world.evm.sentTransactions.filter(tx => tx.serialized === signedTx).length;

  const BROADCAST_PHASES: RampPhase[] = [
    "nablaApprove",
    "nablaSwap",
    "distributeFees",
    "relayApprove",
    "relayBridge",
    "uniswapApprove",
    "uniswapSwap",
    "destinationTransfer"
  ];

  /** Whatever went wrong on the way: every broadcast went out once, and the buyer got exactly what they were promised. */
  function expectDelivered(setup: BuySetup, final: RampState): void {
    expect(final.currentPhase).toBe("complete");
    expect(final.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);
    expect(final.processingLock).toEqual({ locked: false, lockedAt: null });
    for (const phase of BROADCAST_PHASES) expect(submissionsOf(setup.signed[phase]), `${phase} broadcasts`).toBe(1);
    expect(world.evm.revertedReceiptHashes.size).toBe(0);
    expect(stockOf(setup.destination, setup.stock)).toBe(setup.amountRaw);
    expect(usdgOf(setup.ephemeral.address)).toBe(0n);
    expect(world.evm.nativeBalance(Networks.Robinhood, setup.destination)).toBe(config.stocks.gasReserveTargetWei);
  }

  it(
    "delivers exactly the quoted tokens and the gas reserve",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptPaidWorld(setup);

      const final = await startAndSettle(setup);

      expectDelivered(setup, final);
      expect(stockOf(setup.ephemeral.address)).toBe(0n);
      expect(stockOf(FUNDING)).toBe(0n);
      expect(usdgOf(FUNDING)).toBe(0n);
      expect(await Subsidy.count()).toBe(0);
      expect(final.state.relayFillHash).toBe(`0x${"bb".repeat(32)}`);
      expect(final.state.relayBridgeHash).toBe(keccak256(setup.signed.relayBridge as `0x${string}`));
      expect(((await QuoteTicket.findByPk(setup.quoteId)) as QuoteTicket).status).toBe("consumed");

      // Relay was asked for exactly the USDG the quote swaps, delivered to the ephemeral.
      const order = world.relay.quoteRequests.at(-1);
      expect(order).toMatchObject({ amount: setup.fillRaw.toString(), recipient: setup.ephemeral.address, tradeType: "EXACT_OUTPUT" });

      // The fees reached the treasury's payout address.
      expect(world.evm.erc20Balance(Networks.Base, USDC_ON_BASE, FEE_PAYOUT)).toBe(setup.feesRaw);

      const statusResponse = await app.request(`/v1/ramp/${setup.rampId}`, { headers: jsonHeaders(setup.userId) });
      expect(statusResponse.status).toBe(200);
      expect(await statusResponse.json()).toMatchObject({
        currentPhase: "complete",
        gasReserveAmount: formatEther(config.stocks.gasReserveTargetWei),
        gasReserveCurrency: "ETH",
        status: "COMPLETE",
        transactionHash: keccak256(setup.signed.destinationTransfer as `0x${string}`)
      });
    },
    60000
  );

  it.each([EvmToken.AMZN, EvmToken.SGOV] as const)(
    "completes for %s too, whose address sorts differently and whose pool fee differs",
    async token => {
      const setup = await setUpRegisteredRamp({ token });
      scriptPaidWorld(setup);

      const final = await startAndSettle(setup);

      expectDelivered(setup, final);
      expect(stockOf(setup.ephemeral.address, setup.stock)).toBe(0n);
    },
    60000
  );

  it(
    "finishes a registered ramp after the direction was switched off",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptPaidWorld(setup);
      config.stocks.enabledDirections = [];

      const final = await startAndSettle(setup);

      expectDelivered(setup, final);
    },
    60000
  );

  it(
    "keeps a fill above the promise on the ephemeral, then sweeps it to the funding wallet",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptPaidWorld(setup);
      setup.ledger.swapFillBps = 10_050n;
      const surplus = (setup.amountRaw * 10_050n) / 10_000n - setup.amountRaw;

      const final = await startAndSettle(setup);

      expectDelivered(setup, final);
      expect(stockOf(setup.ephemeral.address)).toBe(surplus);
      expect(stockOf(FUNDING)).toBe(0n);

      for (const handler of [baseChainPostProcessHandler, robinhoodPostProcessHandler]) {
        expect(handler.shouldProcess(final)).toBe(true);
        expect(await handler.process(final)).toEqual([true, null]);
      }
      expect(submissionsOf(setup.signed.robinhoodCleanupStock)).toBe(1);
      expect(stockOf(setup.ephemeral.address)).toBe(0n);
      expect(stockOf(FUNDING)).toBe(surplus);
      expect(setup.ledger.allowance(Networks.Robinhood, NVDA_ON_ROBINHOOD, setup.ephemeral.address, FUNDING)).toBeGreaterThanOrEqual(
        surplus
      );
      // What the Relay order left of the USDC goes the same way.
      expect(world.evm.erc20Balance(Networks.Base, USDC_ON_BASE, setup.ephemeral.address)).toBe(0n);
    },
    60000
  );

  it(
    "starts a paid ramp the client never started",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptPaidWorld(setup);
      await RampState.update({ createdAt: new Date(Date.now() - 11 * 60 * 1000) }, { where: { id: setup.rampId } });
      const worker = new UnhandledPaymentWorker("*/15 * * * *", {
        runOnInit: false,
        slackNotifier: { sendMessage: async () => {} } as never
      }) as unknown as { checkUnhandledPayments: () => Promise<void> };

      await worker.checkUnhandledPayments();

      expectDelivered(setup, await settled(setup));
    },
    60000
  );

  it(
    "tops up a Nabla output below the quote from the funding wallet's USDC, so the bridge still gets its input",
    async () => {
      const setup = await setUpRegisteredRamp();
      const nablaShortfall = setup.nablaOutputRaw / 200n;
      setup.nablaOutputRaw -= nablaShortfall;
      scriptPaidWorld(setup);
      const usdcBefore = parseUnits("1000", 6);
      world.evm.setErc20Balance(Networks.Base, USDC_ON_BASE, FUNDING, usdcBefore);

      const final = await startAndSettle(setup);

      expectDelivered(setup, final);
      const subsidy = (await Subsidy.findOne({ where: { phase: "subsidizePostSwap", rampId: setup.rampId } })) as Subsidy;
      expect(subsidy.token).toBe(EvmToken.USDC);
      expect(world.evm.erc20Balance(Networks.Base, USDC_ON_BASE, FUNDING)).toBe(usdcBefore - nablaShortfall);
    },
    60000
  );

  it(
    "tops up a swap shortfall from the funding wallet's inventory",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptPaidWorld(setup);
      setup.ledger.swapFillBps = 9_900n;
      const shortfall = setup.amountRaw - (setup.amountRaw * 9_900n) / 10_000n;
      world.evm.setErc20Balance(Networks.Robinhood, NVDA_ON_ROBINHOOD, FUNDING, shortfall + 1n);

      const final = await startAndSettle(setup);

      expectDelivered(setup, final);
      expect(stockOf(FUNDING)).toBe(1n);
      expect(usdgOf(FUNDING)).toBe(0n);
      const subsidy = (await Subsidy.findOne({ where: { phase: "stockSettlementTopUp", rampId: setup.rampId } })) as Subsidy;
      expect(subsidy.token).toBe(EvmToken.NVDA);
      expect(Number(subsidy.amount)).toBeCloseTo(Number(formatUnits(shortfall, 18)), 10);
      expect(subsidy.payerAccount).toBe(FUNDING);
    },
    60000
  );

  it(
    "buys a swap shortfall with the funding wallet's USDG when its inventory falls short",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptPaidWorld(setup);
      setup.ledger.swapFillBps = 9_900n;
      const shortfall = setup.amountRaw - (setup.amountRaw * 9_900n) / 10_000n;
      const costRaw = (shortfall * NVDA_USD + 10n ** 12n - 1n) / 10n ** 12n;
      const usdgBefore = parseUnits("100", 6);
      world.evm.setErc20Balance(Networks.Robinhood, NVDA_ON_ROBINHOOD, FUNDING, shortfall - 1n);
      world.evm.setErc20Balance(Networks.Robinhood, USDG_ON_ROBINHOOD, FUNDING, usdgBefore);

      const final = await startAndSettle(setup);

      expectDelivered(setup, final);
      expect(stockOf(FUNDING)).toBe(shortfall - 1n);
      expect(usdgOf(FUNDING)).toBe(usdgBefore - costRaw);
      expect(await Subsidy.count({ where: { phase: "stockSettlementTopUp", rampId: setup.rampId } })).toBe(1);
    },
    60000
  );

  it(
    "recovers from an RPC failure while waiting for the fill, without broadcasting the deposit again",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptPaidWorld(setup);
      const reads = world.evm.onReadContract;
      let failures = 1;
      world.evm.onReadContract = (network, params) => {
        if (
          network === Networks.Robinhood &&
          params.functionName === "balanceOf" &&
          params.address === USDG_ON_ROBINHOOD &&
          failures-- > 0
        ) {
          throw new Error("FakeEvm: scripted RPC outage");
        }
        return reads?.(network, params);
      };

      const final = await startAndSettle(setup);

      expectDelivered(setup, final);
      const outages = final.errorLogs.filter(log => log.error.includes("scripted RPC outage"));
      expect(outages).toHaveLength(1);
      expect(outages[0]).toMatchObject({ phase: "relayBridge", recoverable: true });
    },
    60000
  );

  it(
    "settles a deposit whose broadcast response was lost from its receipt, without sending it again",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptPaidWorld(setup);
      const onTransaction = world.evm.onTransaction;
      let responseLost = false;
      world.evm.onTransaction = tx => {
        onTransaction?.(tx);
        if (!responseLost && tx.serialized === setup.signed.relayBridge) {
          responseLost = true;
          throw new Error("FakeEvm: scripted lost response");
        }
      };

      const final = await startAndSettle(setup);

      expectDelivered(setup, final);
      expect(final.errorLogs.map(log => [log.phase, log.recoverable])).toEqual([["relayBridge", true]]);
      expect(final.state.relayBridgeHash).toBe(keccak256(setup.signed.relayBridge as `0x${string}`));
    },
    60000
  );

  it(
    "keeps polling through a Relay status outage until the fill arrives",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptPaidWorld(setup, { fillOnPoll: 3 });
      world.relay.nextStatusFault = "timeout";
      world.relay.statusScript.push({ status: "pending" });
      const sleep = spyOn(shared, "sleep").mockImplementation(async () => {});

      try {
        const final = await startAndSettle(setup);

        expectDelivered(setup, final);
        expect(world.relay.statusRequests).toHaveLength(3);
        // Neither the outage nor the pending answer counts as a phase failure.
        expect(final.errorLogs).toEqual([]);
        expect(final.state.relayFillHash).toBe(`0x${"bb".repeat(32)}`);
      } finally {
        sleep.mockRestore();
      }
    },
    60000
  );

  it(
    "accepts the arrival balance when the Relay status stays unavailable",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptPaidWorld(setup);
      world.relay.nextStatusFault = new Error("Relay status is down");

      const final = await startAndSettle(setup);

      expectDelivered(setup, final);
      expect(world.relay.statusRequests).toHaveLength(1);
      expect(final.state.relayFillHash).toBeUndefined();
      expect(final.state.relayBridgeHash).toBe(keccak256(setup.signed.relayBridge as `0x${string}`));
    },
    60000
  );

  it(
    "pauses above the subsidy cap without failing, and the recovery worker delivers once the balance suffices",
    async () => {
      // About $1,000 of stock gives a cap near $25, and 4% short (inside the swap's 5% hard minimum) costs about $40.
      const setup = await setUpRegisteredRamp({ inputAmount: "5000" });
      expect(Number(setup.maxSubsidyUsd)).toBeLessThan(25);
      scriptPaidWorld(setup);
      setup.ledger.swapFillBps = 9_600n;
      const usdgBefore = parseUnits("1000", 6);
      world.evm.setErc20Balance(Networks.Robinhood, USDG_ON_ROBINHOOD, FUNDING, usdgBefore);

      const paused = await startAndSettle(setup);

      expect(paused.currentPhase).toBe("stockSettlementTopUp");
      const pausedLog = paused.errorLogs.at(-1);
      expect(pausedLog).toMatchObject({ phase: "stockSettlementTopUp", recoverable: true });
      expect(pausedLog?.error).toContain(`above the ${setup.maxSubsidyUsd} USD cap`);
      expect(paused.errorLogs).toHaveLength(1);
      expect(usdgOf(FUNDING)).toBe(usdgBefore);
      expect(stockOf(setup.destination)).toBe(0n);
      const swapped = (setup.amountRaw * 9_600n) / 10_000n;
      expect(stockOf(setup.ephemeral.address)).toBe(swapped);
      expect(await Subsidy.count()).toBe(0);
      expect(submissionsOf(setup.signed.destinationTransfer)).toBe(0);

      // An operator delivers the difference. The worker picks the stale ramp up again.
      setup.ledger.credit(Networks.Robinhood, NVDA_ON_ROBINHOOD, setup.ephemeral.address, setup.amountRaw - swapped);
      await sequelize.query("UPDATE ramp_states SET updated_at = NOW() - INTERVAL '11 minutes' WHERE id = :id", {
        replacements: { id: setup.rampId }
      });
      await (new RampRecoveryWorker("*/5 * * * *", false) as unknown as { recover: () => Promise<void> }).recover();

      const final = (await RampState.findByPk(setup.rampId)) as RampState;
      expectDelivered(setup, final);
      expect(usdgOf(FUNDING)).toBe(usdgBefore);
    },
    60000
  );

  it(
    "fails a ramp whose Pix was never paid, with nothing broadcast and no funds spent",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptPaidWorld(setup);
      world.brla.accountBalances = { BRLA: 0, USDC: 0, USDM: 0, USDT: 0 };
      const ticketsBefore = world.brla.pixOutputTickets.length;
      const wait = spyOn(shared, "waitUntilTrueWithTimeout").mockImplementation(async predicate => {
        if (!(await predicate())) throw new Error("Timeout waiting for the Pix");
      });

      try {
        // Inside the payment window, the ramp keeps waiting.
        const waiting = await startAndSettle(setup);
        expect(waiting.currentPhase).toBe("brlaOnrampMint");
        expect(waiting.errorLogs.every(log => log.recoverable === true)).toBe(true);

        await waiting.update({
          phaseHistory: waiting.phaseHistory.map(entry =>
            entry.phase === "brlaOnrampMint" ? { ...entry, timestamp: new Date(Date.now() - 31 * 60 * 1000) } : entry
          )
        });
        await phaseProcessor.processRamp(setup.rampId);

        const final = (await RampState.findByPk(setup.rampId)) as RampState;
        expect(final.currentPhase).toBe("failed");
        expect(final.processingLock).toEqual({ locked: false, lockedAt: null });
        expect(world.brla.pixOutputTickets).toHaveLength(ticketsBefore);
        expect(world.evm.sentTransactions).toHaveLength(0);
        expect(world.relay.statusRequests).toHaveLength(0);
        expect(stockOf(setup.destination)).toBe(0n);
        expect(world.evm.nativeBalance(Networks.Robinhood, setup.destination)).toBe(0n);
        expect(await Subsidy.count()).toBe(0);
      } finally {
        wait.mockRestore();
      }
    },
    60000
  );
});
