import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as shared from "@vortexfi/shared";
import {
  EvmToken,
  type EvmTransactionData,
  evmTokenConfig,
  FiatToken,
  Networks,
  type PresignedTx,
  RampDirection,
  type RampPhase,
  RELAY_BASE_USDC_ADDRESS,
  RELAY_ROBINHOOD_USDG_ADDRESS,
  robinhoodChain,
  type SignedTypedData,
  signUnsignedTransactions,
  type UnsignedTx
} from "@vortexfi/shared";
// @ts-expect-error The wallet kit is plain JavaScript without declarations.
import { assertSellRequests } from "../../../../../packages/consumer-kit/src/evm-wallet.js";
import Big from "big.js";
import {
  type Abi,
  ContractFunctionExecutionError,
  ContractFunctionZeroDataError,
  decodeFunctionData,
  erc20Abi,
  getAddress,
  HttpRequestError,
  maxUint256,
  parseEther,
  parseSignature,
  parseTransaction,
  parseUnits,
  recoverTypedDataAddress,
  serializeSignature
} from "viem";
import { generatePrivateKey, type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { getEvmFundingAccount } from "../../api/services/phases/blocks/core/evm-funding";
import { getBlockMetadata, getBlockState } from "../../api/services/phases/blocks/core/metadata";
import { ROBINHOOD_STOCKS, type StockSymbol } from "../../api/services/phases/blocks/core/robinhood-stocks";
import { AveniaOfframpPayoutContext } from "../../api/services/phases/blocks/phases/avenia-offramp-payout/simulation";
import { DistributeFeesContext } from "../../api/services/phases/blocks/phases/distribute-fees/simulation";
import { moneriumPermitAbi } from "../../api/services/phases/blocks/phases/monerium-self-transfer/contract";
import { NablaSwapContext } from "../../api/services/phases/blocks/phases/nabla-swap/simulation";
import { StockPermitSourceContext } from "../../api/services/phases/blocks/phases/stock-permit-source/simulation";
import { StockRouteContext, type StockRouteState } from "../../api/services/phases/blocks/phases/stock-route/simulation";
import phaseProcessor from "../../api/services/phases/phase-processor";
import baseChainPostProcessHandler from "../../api/services/phases/post-process/base-chain-post-process-handler";
import RampRecoveryWorker from "../../api/workers/ramp-recovery.worker";
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
// What the fake Avenia reports as the owner of any Pix key.
const RECEIVER_TAX_ID = "12345678900";
const PIX_KEY = "test-pix-key";
const FUNDING = getEvmFundingAccount(Networks.Robinhood).address;
const FEE_PAYOUT = "0x000000000000000000000000000000000000fee5";
const SOLD = "0.5";
const SOLD_RAW = parseUnits(SOLD, 18);

const HAPPY_PATH_PHASES: RampPhase[] = [
  "initial",
  "fundEphemeral",
  "stockPermitTransfer",
  "uniswapApprove",
  "uniswapSwap",
  "relayBridge",
  "distributeFees",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "subsidizePostSwap",
  "brlaPayoutOnBase",
  "complete"
];

interface SellSetup {
  depositAddress: `0x${string}`;
  ephemeral: PrivateKeyAccount;
  /** USDC the fee distribution pays out on Base. */
  feesRaw: bigint;
  ledger: TokenLedger;
  outputAmount: string;
  owner: PrivateKeyAccount;
  presignedTxs: PresignedTx[];
  quoteId: string;
  rampId: string;
  signed: Partial<Record<RampPhase, `0x${string}`>>;
  stock: `0x${string}`;
  /** What the swap must pay the deposit address. */
  swapOutputRaw: bigint;
  /** BRLA the payout hands to the Avenia wallet. */
  transferAmountRaw: bigint;
  userId: string;
}

interface WorldOptions {
  /** How the order settles once the swap paid the deposit address. Default: Relay fills right away. */
  relay?: "refund" | { fillOnPoll: number };
  /** The fill, in bps of what the deposit should yield. Below 10,000 it fell short of the quote. */
  fillBps?: bigint;
  /** The stock amount sold. Default: SOLD. */
  sold?: string;
  token?: StockSymbol;
}

/**
 * Corridor scenario tests for a stock SELL (the seller's permit or one transfer → stock on the ephemeral → Uniswap paying
 * Relay's one-time deposit address → USDC on Base → Nabla → BRLA → Pix via Avenia). Quote, registration, presign
 * validation and start go through the real HTTP API with the shared signer, then the REAL PhaseProcessor drives the
 * real executors. Only the world is fake, and it enforces token semantics, nonces and gas (see TokenLedger).
 */
describe("BRL offramp from a Robinhood Chain stock", () => {
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
    await updatePartnerPricing("vortex", RampDirection.SELL, { payoutAddressEvm: FEE_PAYOUT });
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
    world.evm.setErc20Balance(Networks.Base, USDC_ON_BASE, FEE_PAYOUT, 0n);
    world.brla.onPixOutputTicket = undefined;
    world.brla.accountBalances = { BRLA: 1_000_000, USDC: 0, USDM: 0, USDT: 0 };
    // The in-memory ledger outlives a test, so a shared payout recipient would accumulate.
    world.brla.subaccountEvmWallet = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    world.relay.statusRequests.length = 0;
    world.relay.statusScript.length = 0;
    world.relay.onStatusPoll = undefined;
    world.relay.nextStatusFault = null;
    world.relay.nextQuoteFault = null;
    world.relay.feeBps = 6n;
    world.relay.finalStatus = { inTxHashes: [`0x${"aa".repeat(32)}`], status: "success", txHashes: [`0x${"bb".repeat(32)}`] };
    world.evm.onReadContract = (_network, params) => {
      if (params.functionName !== "quoteSwapExactTokensForTokens") return undefined;
      return (params.args?.[0] as bigint) * 5n * 10n ** 12n;
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

  /** Signs the seller's EIP-712 permit the way a wallet does. */
  async function signPermit(blueprint: UnsignedTx, owner: PrivateKeyAccount): Promise<PresignedTx> {
    const unsigned = blueprint.txData as SignedTypedData;
    const hex = await owner.signTypedData(unsigned as Parameters<PrivateKeyAccount["signTypedData"]>[0]);
    const { r, s, v } = parseSignature(hex);
    return {
      ...blueprint,
      txData: [{ ...unsigned, signature: { deadline: Number(unsigned.message.deadline), r, s, v: Number(v) } }]
    } as PresignedTx;
  }

  /**
   * The Relay order fills what reached its deposit address, less its spread. Broadcasts follow the ledger; on top of it
   * the Nabla swap trades at its quote.
   */
  function scriptWorld(
    setup: SellSetup,
    nablaInputRaw: bigint,
    nablaOutputRaw: bigint,
    { fillBps = 10_000n, relay }: WorldOptions
  ): void {
    const { depositAddress, ephemeral, ledger, signed } = setup;
    const deposited = () => world.evm.erc20Balance(Networks.Robinhood, USDG_ON_ROBINHOOD, depositAddress);
    const fill = () =>
      ledger.credit(
        Networks.Base,
        USDC_ON_BASE,
        ephemeral.address,
        (((deposited() * (10_000n - world.relay.feeBps)) / 10_000n) * fillBps) / 10_000n
      );
    if (relay !== undefined && relay !== "refund") {
      world.relay.onStatusPoll = poll => {
        if (poll === relay.fillOnPoll) fill();
      };
    }
    world.evm.onTransaction = tx => {
      ledger.apply(tx);
      if (tx.serialized === signed.uniswapSwap) {
        if (relay === "refund") ledger.credit(Networks.Robinhood, USDG_ON_ROBINHOOD, ephemeral.address, deposited());
        else if (relay === undefined) fill();
      }
      if (tx.serialized === signed.nablaSwap) {
        const router = parseTransaction(tx.serialized as `0x${string}`).to as string;
        if (ledger.pull(tx, USDC_ON_BASE, ephemeral.address, router, router, nablaInputRaw)) {
          ledger.credit(Networks.Base, BRLA_ON_BASE, ephemeral.address, nablaOutputRaw);
        }
      }
    };
  }

  /** Quote, registration through the real hooks, the shared signer for the ephemeral, the seller's wallet, /v1/ramp/update. */
  async function setUpRegisteredRamp(options: WorldOptions = {}): Promise<SellSetup> {
    const { sold = SOLD, token = EvmToken.NVDA } = options;
    const soldRaw = parseUnits(sold, 18);
    const stock = ROBINHOOD_STOCKS[token].address;
    const ephemeralSecret = generatePrivateKey();
    const ephemeral = privateKeyToAccount(ephemeralSecret);
    const owner = privateKeyToAccount(generatePrivateKey());
    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });
    world.evm.setErc20Balance(Networks.Robinhood, stock, owner.address, soldRaw);

    const quote = await post<{ gasless?: boolean; id: string; outputAmount: string }>("/v1/quotes", {
      from: Networks.Robinhood,
      inputAmount: sold,
      inputCurrency: token,
      network: Networks.Robinhood,
      outputCurrency: FiatToken.BRL,
      rampType: RampDirection.SELL,
      to: "pix"
    });
    const registered = await post<{ id: string; unsignedTxs: UnsignedTx[] }>(
      "/v1/ramp/register",
      {
        additionalData: {
          pixDestination: PIX_KEY,
          receiverTaxId: RECEIVER_TAX_ID,
          taxId: TAX_ID,
          walletAddress: owner.address
        },
        quoteId: quote.id,
        signingAccounts: [{ address: ephemeral.address, type: "EVM" }]
      },
      user.id
    );

    const persistedQuote = (await QuoteTicket.findByPk(quote.id)) as QuoteTicket;
    const route = getBlockMetadata(persistedQuote.metadata, StockRouteContext);
    const nabla = getBlockMetadata(persistedQuote.metadata, NablaSwapContext);
    const payout = getBlockMetadata(persistedQuote.metadata, AveniaOfframpPayoutContext);
    expect(getBlockMetadata(persistedQuote.metadata, StockPermitSourceContext).gasless).toBe(quote.gasless as boolean);

    const rampState = (await RampState.findByPk(registered.id)) as RampState;
    const { relayDepositAddress } = getBlockState<StockRouteState>(rampState.state, StockRouteContext);
    const isEphemeral = (tx: UnsignedTx) => tx.signer.toLowerCase() === ephemeral.address.toLowerCase();
    // What the seller signs stays withheld until every ephemeral signature validates.
    expect(registered.unsignedTxs.every(isEphemeral)).toBe(true);
    const ephemeralPresigned = await signUnsignedTransactions(registered.unsignedTxs, {
      evmEphemeral: { address: ephemeral.address, secret: ephemeralSecret }
    });
    for (const tx of ephemeralPresigned.filter(tx => tx.network === Networks.Robinhood)) {
      expect(Object.keys(tx.meta?.additionalTxs ?? {})).toHaveLength(4);
    }
    const signed: SellSetup["signed"] = {};
    for (const tx of ephemeralPresigned) signed[tx.phase as RampPhase] = tx.txData as `0x${string}`;

    const setup: SellSetup = {
      depositAddress: relayDepositAddress as `0x${string}`,
      ephemeral,
      feesRaw: parseUnits(getBlockMetadata(persistedQuote.metadata, DistributeFeesContext).totalFeesUsd, 6),
      ledger: new TokenLedger(world.evm, NVDA_USD, ephemeral.address),
      outputAmount: quote.outputAmount,
      owner,
      presignedTxs: ephemeralPresigned,
      quoteId: quote.id,
      rampId: registered.id,
      signed,
      stock,
      swapOutputRaw: BigInt(route.swap.outputAmountRaw),
      transferAmountRaw: BigInt(payout.transferAmountRaw),
      userId: user.id
    };
    scriptWorld(setup, BigInt(nabla.inputAmountForSwapRaw), BigInt(nabla.outputAmountRaw), options);

    const released = await post<{ unsignedTxs: UnsignedTx[] }>(
      "/v1/ramp/update",
      { presignedTxs: ephemeralPresigned, rampId: registered.id },
      user.id
    );
    const userBlueprint = released.unsignedTxs.find(tx => !isEphemeral(tx));
    if (!userBlueprint) throw new Error("the signatures did not release what the seller signs");
    if (userBlueprint.phase === "stockPermitTransfer") {
      // What came back through the API and the database is what the Stocks app's wallet has to accept.
      assertSellRequests([userBlueprint], {
        chainId: robinhoodChain.id,
        from: owner.address,
        maxAmountWei: soldRaw,
        network: Networks.Robinhood,
        permitNonce: setup.ledger.permitNonce(stock, owner.address),
        phases: { stockPermitTransfer: ["permit"] },
        spenders: [ephemeral.address],
        token: stock
      });
      await post("/v1/ramp/update", { presignedTxs: [await signPermit(userBlueprint, owner)], rampId: registered.id }, user.id);
    } else {
      expect(userBlueprint.phase).toBe("squidRouterNoPermitTransfer");
      const { data, to, value } = userBlueprint.txData as EvmTransactionData;
      const transferHash = world.evm.broadcastUserTransaction(Networks.Robinhood, owner.address, {
        data,
        to,
        value: BigInt(value ?? "0")
      });
      await post(
        "/v1/ramp/update",
        { additionalData: { squidRouterNoPermitTransferHash: transferHash }, presignedTxs: [], rampId: registered.id },
        user.id
      );
    }
    return setup;
  }

  async function startAndSettle(setup: SellSetup): Promise<RampState> {
    await post("/v1/ramp/start", { rampId: setup.rampId }, setup.userId);
    return settled(setup);
  }

  async function settled(setup: SellSetup): Promise<RampState> {
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

  function expectPaidOut(setup: SellSetup, final: RampState, pixOutBefore: number, phases: RampPhase[]): void {
    expect(final.currentPhase).toBe("complete");
    expect(final.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);
    expect(final.processingLock).toEqual({ locked: false, lockedAt: null });
    for (const phase of phases) expect(submissionsOf(setup.signed[phase]), `${phase} broadcasts`).toBe(1);
    expect(world.evm.revertedReceiptHashes.size).toBe(0);
    // The seller gave up exactly what they sold, and the whole swap output paid the order.
    expect(stockOf(setup.owner.address, setup.stock)).toBe(0n);
    expect(stockOf(setup.ephemeral.address, setup.stock)).toBe(0n);
    expect(usdgOf(setup.ephemeral.address)).toBe(0n);
    expect(usdgOf(setup.depositAddress)).toBe(setup.swapOutputRaw);
    // Everything Relay delivered went into the fees and the swap.
    expect(world.evm.erc20Balance(Networks.Base, USDC_ON_BASE, setup.ephemeral.address)).toBe(0n);
    // The Pix pays the quoted BRL, out of BRLA that reached the Avenia wallet.
    expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(setup.transferAmountRaw);
    expect(world.brla.pixOutputTickets).toHaveLength(pixOutBefore + 1);
    expect(world.brla.payoutQuoteAmounts.at(-1)).toBe(new Big(setup.outputAmount).round(2, 0).toString());
    expect(final.state.payOutTicketId).toBeTruthy();
  }

  function scriptNoncesFailure(cause: ConstructorParameters<typeof ContractFunctionExecutionError>[0]): void {
    const reads = world.evm.onReadContract;
    world.evm.onReadContract = (network, params) => {
      if (network === Networks.Robinhood && params.functionName === "nonces") {
        throw new ContractFunctionExecutionError(cause, {
          abi: params.abi as Abi,
          args: params.args as unknown[],
          functionName: "nonces"
        });
      }
      return reads?.(network, params);
    };
  }

  const scriptTokenWithoutPermit = () => scriptNoncesFailure(new ContractFunctionZeroDataError({ functionName: "nonces" }));

  const ALL_BROADCASTS: RampPhase[] = ["uniswapApprove", "uniswapSwap", "distributeFees", "nablaApprove", "nablaSwap", "brlaPayoutOnBase"];

  it(
    "pulls the stock with the seller's permit, swaps into the Relay deposit address, and pays the BRL",
    async () => {
      const setup = await setUpRegisteredRamp();
      const pixOutBefore = world.brla.pixOutputTickets.length;

      const final = await startAndSettle(setup);

      expectPaidOut(setup, final, pixOutBefore, ["stockPermitTransfer", ...ALL_BROADCASTS]);
      expect(final.state.relayFillHash).toBe(`0x${"bb".repeat(32)}`);
      expect(((await QuoteTicket.findByPk(setup.quoteId)) as QuoteTicket).status).toBe("consumed");
      expect(await Subsidy.count()).toBe(0);
      expect(world.evm.erc20Balance(Networks.Base, USDC_ON_BASE, FEE_PAYOUT)).toBe(setup.feesRaw);

      // The funding wallet relayed exactly what the seller signed. A token would reject anything else.
      const permits = world.evm.sentTransactions.filter(tx => tx.from === FUNDING && tx.to === NVDA_ON_ROBINHOOD);
      expect(permits).toHaveLength(1);
      const { args } = decodeFunctionData({ abi: moneriumPermitAbi, data: permits[0].data as `0x${string}` });
      const [owner, spender, value, deadline, v, r, s] = args;
      expect([owner, spender, value]).toEqual([setup.owner.address, setup.ephemeral.address, SOLD_RAW]);
      const blueprint = final.unsignedTxs.find(tx => tx.signer === setup.owner.address)?.txData as SignedTypedData;
      expect(deadline).toBe(BigInt(blueprint.message.deadline as string));
      expect(
        await recoverTypedDataAddress({
          ...(blueprint as unknown as Parameters<typeof recoverTypedDataAddress>[0]),
          signature: serializeSignature({ r, s, v: BigInt(v) })
        })
      ).toBe(setup.owner.address);

      const statusResponse = await app.request(`/v1/ramp/${setup.rampId}`, { headers: jsonHeaders(setup.userId) });
      expect(statusResponse.status).toBe(200);
      expect(await statusResponse.json()).toMatchObject({ currentPhase: "complete", status: "COMPLETE" });
    },
    60000
  );

  it(
    "refuses a second sale from the same account while one is open, and accepts it once that one ended",
    async () => {
      const setup = await setUpRegisteredRamp();
      const quote = await post<{ id: string }>("/v1/quotes", {
        from: Networks.Robinhood,
        inputAmount: SOLD,
        inputCurrency: EvmToken.NVDA,
        network: Networks.Robinhood,
        outputCurrency: FiatToken.BRL,
        rampType: RampDirection.SELL,
        to: "pix"
      });
      const registerAgain = () =>
        app.request("/v1/ramp/register", {
          body: JSON.stringify({
            additionalData: {
              pixDestination: PIX_KEY,
              receiverTaxId: RECEIVER_TAX_ID,
              taxId: TAX_ID,
              walletAddress: privateKeyToAccount(generatePrivateKey()).address
            },
            quoteId: quote.id,
            signingAccounts: [{ address: privateKeyToAccount(generatePrivateKey()).address, type: "EVM" }]
          }),
          headers: jsonHeaders(setup.userId),
          method: "POST"
        });

      const refused = await registerAgain();
      expect(refused.status).toBe(409);
      expect(await refused.text()).toContain(setup.rampId);

      await RampState.update({ currentPhase: "failed" }, { where: { id: setup.rampId } });
      expect((await registerAgain()).status).toBeLessThan(300);
    },
    60000
  );

  it(
    "neither blocks another account's sale from the same wallet nor shows it the open one",
    async () => {
      const setup = await setUpRegisteredRamp();
      const other = await createTestUser();
      await createTestTaxId(other.id, { subAccountId: "test-subaccount-id-2", taxId: "10987654321" });
      const quote = await post<{ id: string }>("/v1/quotes", {
        from: Networks.Robinhood,
        inputAmount: SOLD,
        inputCurrency: EvmToken.NVDA,
        network: Networks.Robinhood,
        outputCurrency: FiatToken.BRL,
        rampType: RampDirection.SELL,
        to: "pix"
      });

      const response = await app.request("/v1/ramp/register", {
        body: JSON.stringify({
          additionalData: {
            pixDestination: PIX_KEY,
            receiverTaxId: RECEIVER_TAX_ID,
            taxId: "10987654321",
            walletAddress: setup.owner.address
          },
          quoteId: quote.id,
          signingAccounts: [{ address: privateKeyToAccount(generatePrivateKey()).address, type: "EVM" }]
        }),
        headers: jsonHeaders(other.id),
        method: "POST"
      });

      const body = await response.text();
      expect(response.status, body).toBeLessThan(300);
      expect(body).not.toContain(setup.rampId);
    },
    60000
  );

  it.each([EvmToken.AMZN, EvmToken.SGOV] as const)(
    "completes for %s too, whose address sorts differently and whose pool fee differs",
    async token => {
      const setup = await setUpRegisteredRamp({ token });
      const pixOutBefore = world.brla.pixOutputTickets.length;

      const final = await startAndSettle(setup);

      expectPaidOut(setup, final, pixOutBefore, ["stockPermitTransfer", ...ALL_BROADCASTS]);
    },
    60000
  );

  it(
    "spends no funding gas on a seller who moved the tokens away, and completes once they are back",
    async () => {
      const setup = await setUpRegisteredRamp();
      const pixOutBefore = world.brla.pixOutputTickets.length;
      world.evm.setErc20Balance(Networks.Robinhood, setup.stock, setup.owner.address, SOLD_RAW - 1n);

      const held = await startAndSettle(setup);

      expect(held.currentPhase).toBe("fundEphemeral");
      expect(world.evm.sentTransactions).toHaveLength(0);
      expect(held.errorLogs.at(-1)).toMatchObject({ phase: "fundEphemeral", recoverable: true });

      world.evm.setErc20Balance(Networks.Robinhood, setup.stock, setup.owner.address, SOLD_RAW);
      await phaseProcessor.processRamp(setup.rampId);

      expectPaidOut(setup, await settled(setup), pixOutBefore, ["stockPermitTransfer", ...ALL_BROADCASTS]);
    },
    60000
  );

  it.each([
    ["the token no longer answers as having a permit", () => scriptTokenWithoutPermit(), 503],
    ["the read failed", () => scriptNoncesFailure(new HttpRequestError({ status: 503, url: "https://rpc.invalid" })), 503]
  ] as const)(
    "registers nothing and keeps the gasless quote when %s",
    async (_label, script, status) => {
      const owner = privateKeyToAccount(generatePrivateKey());
      const ephemeral = privateKeyToAccount(generatePrivateKey());
      const user = await createTestUser();
      await createTestTaxId(user.id, { taxId: TAX_ID });
      const quote = await post<{ gasless?: boolean; id: string }>("/v1/quotes", {
        from: Networks.Robinhood,
        inputAmount: SOLD,
        inputCurrency: EvmToken.NVDA,
        network: Networks.Robinhood,
        outputCurrency: FiatToken.BRL,
        rampType: RampDirection.SELL,
        to: "pix"
      });
      expect(quote.gasless).toBe(true);
      script();

      const response = await app.request("/v1/ramp/register", {
        body: JSON.stringify({
          additionalData: { pixDestination: PIX_KEY, receiverTaxId: RECEIVER_TAX_ID, taxId: TAX_ID, walletAddress: owner.address },
          quoteId: quote.id,
          signingAccounts: [{ address: ephemeral.address, type: "EVM" }]
        }),
        headers: jsonHeaders(user.id),
        method: "POST"
      });

      expect(response.status).toBe(status);
      expect((await QuoteTicket.findByPk(quote.id))?.status).toBe("pending");
      expect(await RampState.count({ where: { quoteId: quote.id } })).toBe(0);
    },
    60000
  );

  it(
    "completes with one user transfer when the token has no permit",
    async () => {
      scriptTokenWithoutPermit();
      const setup = await setUpRegisteredRamp();
      const pixOutBefore = world.brla.pixOutputTickets.length;

      const final = await startAndSettle(setup);

      expectPaidOut(setup, final, pixOutBefore, ALL_BROADCASTS);
      expect(setup.signed.stockPermitTransfer).toBeUndefined();
      // No permit means the funding wallet never touched the token, and the ephemeral never pulled.
      expect(world.evm.sentTransactions.filter(tx => tx.from === FUNDING && tx.to === NVDA_ON_ROBINHOOD)).toHaveLength(0);
      // No pull either, so the approval takes the ephemeral's first nonce.
      expect(parseTransaction(setup.signed.uniswapApprove as `0x${string}`).nonce).toBe(0);
    },
    60000
  );

  it(
    "starts and completes a one-transfer sale the client reported but never started",
    async () => {
      scriptTokenWithoutPermit();
      const setup = await setUpRegisteredRamp();
      const pixOutBefore = world.brla.pixOutputTickets.length;
      expect(stockOf(setup.ephemeral.address)).toBe(SOLD_RAW);
      await RampState.update({ createdAt: new Date(Date.now() - 17 * 60 * 1000) }, { where: { id: setup.rampId } });

      await (new RampRecoveryWorker("*/5 * * * *", false) as unknown as { recover: () => Promise<void> }).recover();

      expectPaidOut(setup, await settled(setup), pixOutBefore, ALL_BROADCASTS);
    },
    60000
  );

  it(
    "recovers from an RPC failure and a Relay status outage without repeating any broadcast",
    async () => {
      const setup = await setUpRegisteredRamp({ relay: { fillOnPoll: 3 } });
      const pixOutBefore = world.brla.pixOutputTickets.length;
      const reads = world.evm.onReadContract;
      let failures = 1;
      world.evm.onReadContract = (network, params) => {
        if (network === Networks.Base && params.functionName === "balanceOf" && params.address === USDC_ON_BASE && failures-- > 0) {
          throw new Error("FakeEvm: scripted RPC outage");
        }
        return reads?.(network, params);
      };
      // First poll: Relay is out and the balance read fails too. The phase re-enters, sees pending, then the fill.
      world.relay.nextStatusFault = "timeout";
      world.relay.statusScript.push({ status: "pending" });
      const sleep = spyOn(shared, "sleep").mockImplementation(async () => {});

      try {
        const final = await startAndSettle(setup);

        expectPaidOut(setup, final, pixOutBefore, ["stockPermitTransfer", ...ALL_BROADCASTS]);
        const outages = final.errorLogs.filter(log => log.error.includes("scripted RPC outage"));
        expect(outages).toHaveLength(1);
        expect(outages[0]).toMatchObject({ phase: "relayBridge", recoverable: true });
        expect(world.relay.statusRequests).toHaveLength(3);
      } finally {
        sleep.mockRestore();
      }
    },
    60000
  );

  it(
    "settles a swap whose broadcast response was lost from its receipt, without paying the deposit address twice",
    async () => {
      const setup = await setUpRegisteredRamp();
      const pixOutBefore = world.brla.pixOutputTickets.length;
      const onTransaction = world.evm.onTransaction;
      let responseLost = false;
      world.evm.onTransaction = tx => {
        onTransaction?.(tx);
        if (!responseLost && tx.serialized === setup.signed.uniswapSwap) {
          responseLost = true;
          throw new Error("FakeEvm: scripted lost response");
        }
      };

      const final = await startAndSettle(setup);

      expectPaidOut(setup, final, pixOutBefore, ["stockPermitTransfer", ...ALL_BROADCASTS]);
      expect(final.errorLogs.map(log => [log.phase, log.recoverable])).toEqual([["uniswapSwap", true]]);
    },
    60000
  );

  it(
    "holds the swap through an issuer pause and resumes without repeating the approval",
    async () => {
      const setup = await setUpRegisteredRamp();
      const pixOutBefore = world.brla.pixOutputTickets.length;
      const reads = world.evm.onReadContract;
      let pausedReads = 0;
      const onTransaction = world.evm.onTransaction;
      world.evm.onTransaction = tx => {
        onTransaction?.(tx);
        // Trading pauses right after the approval is mined.
        if (tx.serialized === setup.signed.uniswapApprove) pausedReads = 2;
      };
      world.evm.onReadContract = (network, params) => {
        if (params.functionName === "paused" && pausedReads > 0) {
          pausedReads -= 1;
          return true;
        }
        return reads?.(network, params);
      };

      const final = await startAndSettle(setup);

      expectPaidOut(setup, final, pixOutBefore, ["stockPermitTransfer", ...ALL_BROADCASTS]);
      const holds = final.errorLogs.filter(log => log.error.includes("paused by the issuer"));
      expect(holds).toHaveLength(2);
      expect(holds.every(log => log.phase === "uniswapSwap" && log.recoverable === true)).toBe(true);
    },
    60000
  );

  it(
    "pays the quoted BRL when the swap beats the quote, then sweeps the extra USDC to the funding wallet",
    async () => {
      const setup = await setUpRegisteredRamp();
      setup.ledger.swapFillBps = 10_100n;
      const usdcBefore = world.evm.erc20Balance(Networks.Base, USDC_ON_BASE, FUNDING);

      const final = await startAndSettle(setup);

      expect(final.currentPhase).toBe("complete");
      expect(world.brla.payoutQuoteAmounts.at(-1)).toBe(new Big(setup.outputAmount).round(2, 0).toString());
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(setup.transferAmountRaw);
      const surplus = world.evm.erc20Balance(Networks.Base, USDC_ON_BASE, setup.ephemeral.address);
      expect(surplus).toBeGreaterThan(0n);

      expect(baseChainPostProcessHandler.shouldProcess(final)).toBe(true);
      expect(await baseChainPostProcessHandler.process(final)).toEqual([true, null]);
      expect(world.evm.erc20Balance(Networks.Base, USDC_ON_BASE, setup.ephemeral.address)).toBe(0n);
      expect(world.evm.erc20Balance(Networks.Base, USDC_ON_BASE, FUNDING)).toBe(usdcBefore + surplus);
    },
    60000
  );

  it(
    "pauses for reconciliation on a Relay refund, with the USDG back on the ephemeral and a signed way to recover it",
    async () => {
      const setup = await setUpRegisteredRamp({ relay: "refund" });
      world.relay.finalStatus = { failReason: "SOLVER_CAPACITY_EXCEEDED", status: "refund" };
      const pixOutBefore = world.brla.pixOutputTickets.length;

      const paused = await startAndSettle(setup);

      expect(paused.currentPhase).toBe("relayBridge");
      expect(paused.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(paused.errorLogs).toHaveLength(1);
      expect(paused.errorLogs[0]).toMatchObject({ phase: "relayBridge", recoverable: true });
      expect(paused.errorLogs[0].error).toContain("SOLVER_CAPACITY_EXCEEDED");
      expect(world.relay.statusRequests).toHaveLength(1);

      expect(usdgOf(setup.ephemeral.address)).toBe(setup.swapOutputRaw);
      expect(world.evm.erc20Balance(Networks.Base, USDC_ON_BASE, setup.ephemeral.address)).toBe(0n);
      expect(submissionsOf(setup.signed.distributeFees)).toBe(0);
      expect(submissionsOf(setup.signed.nablaSwap)).toBe(0);
      expect(world.brla.pixOutputTickets).toHaveLength(pixOutBefore);

      // Permit pull, approval and swap used nonces 0 to 2, so the recovery approval must be signed at nonce 3 too.
      const liveNonce = world.evm.transactionCount(Networks.Robinhood, setup.ephemeral.address);
      expect(liveNonce).toBe(3);
      const backup = setup.presignedTxs.find(tx => tx.phase === "relayBackupApprove");
      const variant = Object.values(backup?.meta?.additionalTxs ?? {}).find(tx => tx.nonce === liveNonce);
      const parsed = parseTransaction(variant?.txData as `0x${string}`);
      expect(getAddress(parsed.to as string)).toBe(USDG_ON_ROBINHOOD);
      const { args, functionName } = decodeFunctionData({ abi: erc20Abi, data: parsed.data as `0x${string}` });
      expect(functionName).toBe("approve");
      expect(args).toEqual([FUNDING, maxUint256]);

      // Re-entering stays paused, and nothing is sent again.
      const sent = world.evm.sentTransactions.length;
      await phaseProcessor.processRamp(setup.rampId);
      const again = (await RampState.findByPk(setup.rampId)) as RampState;
      expect(again.currentPhase).toBe("relayBridge");
      expect(world.evm.sentTransactions).toHaveLength(sent);
    },
    60000
  );

  it(
    "fails a ramp whose permit expired unused, leaving the stock with the seller",
    async () => {
      const setup = await setUpRegisteredRamp();
      let issuerPaused = true;
      const reads = world.evm.onReadContract;
      world.evm.onReadContract = (network, params) => {
        if (params.functionName === "paused") return issuerPaused;
        return reads?.(network, params);
      };

      // An issuer pause keeps the ramp from using the permit.
      const held = await startAndSettle(setup);
      expect(held.currentPhase).toBe("stockPermitTransfer");
      expect(held.errorLogs.every(log => log.recoverable === true && log.error.includes("paused by the issuer"))).toBe(true);
      expect(stockOf(setup.owner.address)).toBe(SOLD_RAW);

      // The pause lifts two hours later, past the permit's one-hour deadline.
      issuerPaused = false;
      const twoHoursLater = Date.now() + 2 * 60 * 60 * 1000;
      const clock = spyOn(Date, "now").mockImplementation(() => twoHoursLater);
      try {
        await phaseProcessor.processRamp(setup.rampId);
      } finally {
        clock.mockRestore();
      }

      const final = (await RampState.findByPk(setup.rampId)) as RampState;
      expect(final.currentPhase).toBe("failed");
      expect(final.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(final.errorLogs.at(-1)?.error).toContain("expired unused");

      // No token moved, no permit was submitted, and the ephemeral sent nothing on Robinhood Chain.
      expect(stockOf(setup.owner.address)).toBe(SOLD_RAW);
      expect(stockOf(setup.ephemeral.address)).toBe(0n);
      expect(world.evm.sentTransactions.filter(tx => tx.to === NVDA_ON_ROBINHOOD && tx.from === FUNDING)).toHaveLength(0);
      expect(world.evm.transactionCount(Networks.Robinhood, setup.ephemeral.address)).toBe(0);
      expect(world.relay.statusRequests).toHaveLength(0);
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(0n);
    },
    60000
  );

  it(
    "tops up a fill below the quote from the funding wallet's USDC",
    async () => {
      const usdcBefore = parseUnits("1000", 6);
      world.evm.setErc20Balance(Networks.Base, USDC_ON_BASE, FUNDING, usdcBefore);
      const setup = await setUpRegisteredRamp({ fillBps: 9_970n });
      const pixOutBefore = world.brla.pixOutputTickets.length;

      const final = await startAndSettle(setup);

      expectPaidOut(setup, final, pixOutBefore, ["stockPermitTransfer", ...ALL_BROADCASTS]);
      const subsidy = (await Subsidy.findOne({ where: { phase: "subsidizePreSwap", rampId: setup.rampId } })) as Subsidy;
      expect(subsidy.token).toBe(EvmToken.USDC);
      expect(world.evm.erc20Balance(Networks.Base, USDC_ON_BASE, FUNDING)).toBe(usdcBefore - parseUnits(String(subsidy.amount), 6));
    },
    60000
  );
  // The order is sized at 95% of the swap output, so this is a fill that pays only the order. Under the top-up's
  // 1 USD floor it completes on a subsidy; above it, it waits for an operator before any payout.
  it.each([
    ["0.08", "complete"],
    ["0.5", "subsidizePreSwap"]
  ] as const)("a sale of %s NVDA filled only up to the order ends in %s", async (sold, phase) => {
    world.evm.setErc20Balance(Networks.Base, USDC_ON_BASE, FUNDING, parseUnits("1000", 6));
    const setup = await setUpRegisteredRamp({ fillBps: 9_500n, sold });
    const pixOutBefore = world.brla.pixOutputTickets.length;

    const final = await startAndSettle(setup);

    expect(final.currentPhase).toBe(phase);
    const subsidies = await Subsidy.count({ where: { phase: "subsidizePreSwap", rampId: setup.rampId } });
    expect([subsidies, world.brla.pixOutputTickets.length - pixOutBefore]).toEqual(phase === "complete" ? [1, 1] : [0, 0]);
  }, 60000);

  it(
    "pauses instead of topping up a fill whose shortfall exceeds the stock sale's USD ceiling",
    async () => {
      const usdcBefore = parseUnits("1000", 6);
      world.evm.setErc20Balance(Networks.Base, USDC_ON_BASE, FUNDING, usdcBefore);
      const { saleSubsidyMaxUsd } = config.stocks;
      config.stocks.saleSubsidyMaxUsd = "0.1";
      try {
        const setup = await setUpRegisteredRamp({ fillBps: 9_970n });

        const paused = await startAndSettle(setup);

        expect(paused.currentPhase).toBe("subsidizePreSwap");
        expect(paused.errorLogs.at(-1)?.error).toContain("exceeds the stock sale cap");
        expect(await Subsidy.count()).toBe(0);
        expect(world.evm.erc20Balance(Networks.Base, USDC_ON_BASE, FUNDING)).toBe(usdcBefore);
      } finally {
        config.stocks.saleSubsidyMaxUsd = saleSubsidyMaxUsd;
      }
    },
    60000
  );
});
