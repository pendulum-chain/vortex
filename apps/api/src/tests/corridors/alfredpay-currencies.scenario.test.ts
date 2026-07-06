import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_ERC20_TOKEN,
  AlfredPayCountry,
  AlfredpayOfframpStatus,
  AlfredpayOnrampStatus,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  getAnyFiatTokenDetails,
  multiplyByPowerOfTen,
  Networks,
  RampDirection,
  type RampPhase,
  type UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { BaseError, ContractFunctionExecutionError, decodeFunctionData, encodeFunctionData, erc20Abi, parseTransaction } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { parseUnits } from "viem/utils";
import phaseProcessor from "../../api/services/phases/phase-processor";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestAlfredpayCustomer, createTestUser } from "../../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../../test-utils/test-app";

const USDT_ON_ARBITRUM = evmTokenConfig[Networks.Arbitrum][EvmToken.USDT]?.erc20AddressSourceChain as `0x${string}`;
if (!USDT_ON_ARBITRUM) {
  throw new Error("USDT token config missing for Arbitrum");
}

const CHAIN_IDS: Partial<Record<Networks, number>> = {
  [Networks.Arbitrum]: 42161,
  [Networks.Polygon]: 137
};

const ONRAMP_PHASES: RampPhase[] = [
  "initial",
  "alfredpayOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "squidRouterSwap",
  "finalSettlementSubsidy",
  "destinationTransfer",
  "complete"
];

// Cross-chain BUY: squidRouterSwap executes for real (Polygon mint token →
// Arbitrum USDT) and squidRouterPay settles via the destination balance check.
const CROSS_CHAIN_ONRAMP_PHASES: RampPhase[] = [
  "initial",
  "alfredpayOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "squidRouterSwap",
  "squidRouterPay",
  "finalSettlementSubsidy",
  "destinationTransfer",
  "complete"
];

const OFFRAMP_PHASES: RampPhase[] = [
  "initial",
  "squidRouterPermitExecute",
  "fundEphemeral",
  "finalSettlementSubsidy",
  "alfredpayOfframpTransfer",
  "complete"
];

interface CurrencyCase {
  fiat: FiatToken;
  /** Alfredpay-side currency code expected on created orders. */
  alfredpayCurrency: string;
  /** KYC country the registration guard requires a completed profile for. */
  country: AlfredPayCountry;
  /** Quote destination string (payment rail). */
  rail: string;
  /** Fiat amount for the BUY quote (within the per-currency limits). */
  onrampInputAmount: string;
  /** USDT the anchor mints per unit of fiat. */
  onrampRate: number;
  /** USDT amount for the SELL quote (within the per-currency limits). */
  offrampInputAmount: string;
  /** Fiat the anchor pays out per USDT. */
  offrampRate: number;
}

// Rates mirror the FakePrices per-USD feeds so quote pricing stays sane.
const CURRENCY_CASES: CurrencyCase[] = [
  {
    alfredpayCurrency: "USD",
    country: AlfredPayCountry.US,
    fiat: FiatToken.USD,
    offrampInputAmount: "5",
    offrampRate: 1,
    onrampInputAmount: "20000",
    onrampRate: 1,
    rail: "ach"
  },
  {
    alfredpayCurrency: "COP",
    country: AlfredPayCountry.CO,
    fiat: FiatToken.COP,
    offrampInputAmount: "100",
    offrampRate: 4000,
    onrampInputAmount: "50000",
    onrampRate: 1 / 4000,
    rail: "ach"
  },
  {
    alfredpayCurrency: "ARS",
    country: AlfredPayCountry.AR,
    fiat: FiatToken.ARS,
    offrampInputAmount: "100",
    offrampRate: 1000,
    onrampInputAmount: "10000",
    onrampRate: 1 / 1000,
    rail: "cbu"
  }
];

// MXN's own corridor files cover the direct Polygon paths (mxn-onramp /
// mxn-offramp) and the cross-chain BUY leg (mxn-onramp-crosschain); its
// cross-chain SELL case lives here with the rest of the cross-chain matrix.
const CROSS_CHAIN_OFFRAMP_CASES: CurrencyCase[] = [
  ...CURRENCY_CASES,
  {
    alfredpayCurrency: "MXN",
    country: AlfredPayCountry.MX,
    fiat: FiatToken.MXN,
    offrampInputAmount: "100",
    offrampRate: 20,
    onrampInputAmount: "2000",
    onrampRate: 0.05,
    rail: "spei"
  }
];

/**
 * Parameterized scenarios for the Alfredpay corridors beyond MXN: USD (ach),
 * COP (ach) and ARS (cbu), each in both directions. The deeper security and
 * subsidy-cap variants live in the MXN corridor files — the phase handlers are
 * shared, so what these tests protect is the per-currency configuration
 * (rails, limits, and the fiat↔Alfredpay currency mapping) on the happy path
 * plus one transient (recoverable) and one unrecoverable failure per currency.
 * The cross-chain legs run here per currency too: BUY bridges the Polygon mint
 * to Arbitrum via squid (mirroring the MXN cross-chain corridor) and SELL
 * takes the no-permit cross-chain fallback (user-broadcast squid approve+swap
 * on Arbitrum, verified by hash before the Polygon deposit transfer) — the
 * latter including MXN, whose own files only cover the direct Polygon path.
 */
describe("Alfredpay currency corridors (USD/COP/ARS, on- and offramp)", () => {
  let world: FakeWorld;
  let auth: { restore: () => void };
  let app: TestApp;

  beforeAll(async () => {
    world = installFakeWorld();
    auth = installFakeSupabaseAuth();
    await setupTestDatabase();
    app = await startTestApp();
  });

  afterAll(async () => {
    await app?.close();
    auth?.restore();
    world?.restore();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    world.evm.failNextSends = 0;
    world.evm.onTransaction = undefined;
    world.evm.onReadContract = undefined;
    world.alfredpay.onCreateOnramp = undefined;
    world.alfredpay.onrampStatus = AlfredpayOnrampStatus.TRADE_COMPLETED;
    world.alfredpay.onrampStatusMetadata = null;
    world.alfredpay.offrampStatus = AlfredpayOfframpStatus.FIAT_TRANSFER_COMPLETED;
    world.alfredpay.offrampDepositAddress = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    // The direct corridors never bridge; the cross-chain setups switch the
    // fake route to USDT's 6 decimals, so reset to the fake's default here.
    world.squidRouter.toTokenDecimals = 18;
    world.squidRouter.bridgeStatus = "success";
  });

  function applyErc20TransfersToLedger(): void {
    world.evm.onTransaction = tx => {
      if (!tx.serialized) {
        return;
      }
      const parsed = parseTransaction(tx.serialized as `0x${string}`);
      if (!parsed.to || !parsed.data) {
        return;
      }
      const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data: parsed.data });
      if (functionName !== "transfer") {
        return;
      }
      const [recipient, amount] = args as [`0x${string}`, bigint];
      world.evm.setErc20Balance(
        tx.network,
        parsed.to,
        recipient,
        world.evm.erc20Balance(tx.network, parsed.to, recipient) + amount
      );
    };
  }

  async function createQuoteViaApi(body: Record<string, unknown>): Promise<{ id: string; outputAmount: string }> {
    const response = await app.request("/v1/quotes", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(response.status, `quote creation failed: ${await response.clone().text()}`).toBe(201);
    return (await response.json()) as { id: string; outputAmount: string };
  }

  async function registerViaApi(
    quoteId: string,
    userId: string,
    signingAccounts: Array<{ address: string; type: string }>,
    additionalData: Record<string, unknown>
  ): Promise<{ id: string }> {
    const response = await app.request("/v1/ramp/register", {
      body: JSON.stringify({ additionalData, quoteId, signingAccounts }),
      headers: {
        Authorization: `Bearer ${testUserToken(userId)}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    expect(response.status, `registration failed: ${await response.clone().text()}`).toBe(201);
    return (await response.json()) as { id: string };
  }

  async function updateRampViaApi(rampId: string, userId: string, body: Record<string, unknown>): Promise<void> {
    const response = await app.request("/v1/ramp/update", {
      body: JSON.stringify({ rampId, ...body }),
      headers: {
        Authorization: `Bearer ${testUserToken(userId)}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    expect(response.status, `ramp update failed: ${await response.clone().text()}`).toBe(200);
  }

  function blueprintOf(unsignedTxs: UnsignedTx[], phase: RampPhase): UnsignedTx {
    const blueprint = unsignedTxs.find(tx => tx.phase === phase);
    expect(blueprint, `missing ${phase} blueprint in persisted ramp state`).toBeDefined();
    return blueprint as UnsignedTx;
  }

  /** Signs a blueprint exactly as issued; the nonce may be overridden for backups. */
  async function signBlueprint(ephemeral: PrivateKeyAccount, blueprint: UnsignedTx, nonce?: number): Promise<`0x${string}`> {
    const txData = blueprint.txData as unknown as { to: `0x${string}`; data: `0x${string}`; value?: string };
    const chainId = CHAIN_IDS[blueprint.network];
    if (!chainId) {
      throw new Error(`No chain id mapped for ${blueprint.network}`);
    }
    return ephemeral.signTransaction({
      chainId,
      data: txData.data,
      gas: 600_000n,
      // validatePresignedTxs enforces the blueprint's fee minimums (3 gwei floor on Polygon).
      maxFeePerGas: 5_000_000_000n,
      maxPriorityFeePerGas: 5_000_000_000n,
      nonce: nonce ?? blueprint.nonce,
      to: txData.to,
      type: "eip1559",
      value: BigInt(txData.value ?? "0")
    });
  }

  /** validatePresignedTxs requires 4 same-call backups at the next 4 nonces. */
  async function presignWithBackups(ephemeral: PrivateKeyAccount, blueprint: UnsignedTx) {
    const backups: Record<string, { nonce: number; txData: `0x${string}` }> = {};
    for (let i = 1; i <= 4; i++) {
      backups[`backup${i}`] = { nonce: blueprint.nonce + i, txData: await signBlueprint(ephemeral, blueprint, blueprint.nonce + i) };
    }
    return {
      meta: { additionalTxs: backups },
      network: blueprint.network,
      nonce: blueprint.nonce,
      phase: blueprint.phase,
      signer: ephemeral.address,
      txData: await signBlueprint(ephemeral, blueprint)
    };
  }

  /** Broadcasts a user-wallet blueprint on its source chain exactly as issued. */
  function broadcastUserBlueprint(userWallet: PrivateKeyAccount, blueprint: UnsignedTx): `0x${string}` {
    const txData = blueprint.txData as unknown as { to: `0x${string}`; data: `0x${string}`; value?: string };
    return world.evm.broadcastUserTransaction(blueprint.network, userWallet.address, {
      data: txData.data,
      to: txData.to,
      value: BigInt(txData.value ?? "0")
    });
  }

  /** Scripts the EIP-2612 nonces() probe to revert so registration takes the no-permit path. */
  function failNoncesProbe(): void {
    world.evm.onReadContract = (_network, params) => {
      if (params.functionName === "nonces") {
        throw new ContractFunctionExecutionError(new BaseError("nonces() reverted"), {
          abi: erc20Abi,
          contractAddress: params.address,
          functionName: "nonces"
        });
      }
      return undefined;
    };
  }

  interface OnrampSetup {
    rampId: string;
    quoteId: string;
    destination: `0x${string}`;
    /** Raw quoted USDT output the destination must receive. */
    amountRaw: bigint;
  }

  /**
   * Full BUY setup via the HTTP API — quote, register, presign the destination
   * transfer (plus the four required backups), update — then script the fake
   * world for the happy path: minted USDT and gas already on the ephemeral,
   * raw ERC-20 transfers applied to the in-memory ledger.
   */
  async function setUpOnrampRamp(currency: CurrencyCase): Promise<OnrampSetup> {
    world.alfredpay.onrampRate = currency.onrampRate;
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const destination = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;

    const user = await createTestUser();
    await createTestAlfredpayCustomer(user.id, { country: currency.country });
    const quote = await createQuoteViaApi({
      from: currency.rail,
      inputAmount: currency.onrampInputAmount,
      inputCurrency: currency.fiat,
      network: Networks.Polygon,
      outputCurrency: EvmToken.USDT,
      rampType: RampDirection.BUY,
      to: Networks.Polygon
    });
    const ramp = await registerViaApi(quote.id, user.id, [{ address: ephemeral.address, type: "EVM" }], {
      destinationAddress: destination
    });

    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    const mintAmountRaw = BigInt(persistedQuote?.metadata.alfredpayMint?.outputAmountRaw ?? "0");
    expect(mintAmountRaw).toBeGreaterThan(0n);
    const amountRaw = parseUnits(quote.outputAmount, ALFREDPAY_ERC20_DECIMALS);

    const signTransfer = (nonce: number) =>
      ephemeral.signTransaction({
        chainId: 137,
        data: encodeFunctionData({ abi: erc20Abi, args: [destination, amountRaw], functionName: "transfer" }),
        gas: 100_000n,
        maxFeePerGas: 5_000_000_000n,
        maxPriorityFeePerGas: 5_000_000_000n,
        nonce,
        to: ALFREDPAY_ERC20_TOKEN,
        type: "eip1559"
      });
    const backups: Record<string, { nonce: number; txData: `0x${string}` }> = {};
    for (let i = 1; i <= 4; i++) {
      backups[`backup${i}`] = { nonce: i, txData: await signTransfer(i) };
    }
    await updateRampViaApi(ramp.id, user.id, {
      presignedTxs: [
        {
          meta: { additionalTxs: backups },
          network: Networks.Polygon,
          nonce: 0,
          phase: "destinationTransfer",
          signer: ephemeral.address,
          txData: await signTransfer(0)
        }
      ]
    });

    world.evm.setNativeBalance(Networks.Polygon, ephemeral.address, parseUnits("2", 18));
    world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, ephemeral.address, mintAmountRaw);
    applyErc20TransfersToLedger();

    return { amountRaw, destination, quoteId: quote.id, rampId: ramp.id };
  }

  interface OfframpSetup {
    rampId: string;
    quoteId: string;
    /** Raw (6-decimal) USDT amount the offramp moves. */
    inputAmountRaw: bigint;
    /** Anchor deposit address the final transfer must pay. */
    depositAddress: string;
  }

  /**
   * Full SELL setup via the HTTP API on the no-permit path — Polygon USDT has
   * no EIP-2612 support, so the nonces() probe is scripted to fail as a
   * contract-call error and the user broadcasts a plain transfer: quote,
   * register, user-wallet broadcast, presign of the ephemeral's deposit
   * transfer (plus backups), update — then script the fake world for the
   * happy path.
   */
  async function setUpOfframpRamp(currency: CurrencyCase): Promise<OfframpSetup> {
    world.alfredpay.offrampRate = currency.offrampRate;
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const userWallet = privateKeyToAccount(generatePrivateKey());

    failNoncesProbe();

    const user = await createTestUser();
    await createTestAlfredpayCustomer(user.id, { country: currency.country });
    const quote = await createQuoteViaApi({
      from: Networks.Polygon,
      inputAmount: currency.offrampInputAmount,
      inputCurrency: EvmToken.USDT,
      network: Networks.Polygon,
      outputCurrency: currency.fiat,
      rampType: RampDirection.SELL,
      to: currency.rail
    });
    const ramp = await registerViaApi(quote.id, user.id, [{ address: ephemeral.address, type: "EVM" }], {
      fiatAccountId: "test-fiat-account-1",
      walletAddress: userWallet.address
    });

    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    const inputAmountRaw = BigInt(persistedQuote?.metadata.alfredpayOfframp?.inputAmountRaw ?? "0");
    expect(inputAmountRaw).toBeGreaterThan(0n);

    const registered = await RampState.findByPk(ramp.id);
    const allUnsignedTxs: UnsignedTx[] = registered?.unsignedTxs ?? [];
    const userTransferBlueprint = allUnsignedTxs.find(tx => tx.phase === "squidRouterNoPermitTransfer");
    const offrampTransferBlueprint = allUnsignedTxs.find(tx => tx.phase === "alfredpayOfframpTransfer");
    expect(userTransferBlueprint).toBeDefined();
    expect(offrampTransferBlueprint).toBeDefined();
    const userTxData = userTransferBlueprint?.txData as unknown as { to: `0x${string}`; data: `0x${string}` };
    const offrampTxData = offrampTransferBlueprint?.txData as unknown as { to: `0x${string}`; data: `0x${string}` };

    const signOfframpTransfer = (nonce: number) =>
      ephemeral.signTransaction({
        chainId: 137,
        data: offrampTxData.data,
        gas: 100_000n,
        maxFeePerGas: 5_000_000_000n,
        maxPriorityFeePerGas: 5_000_000_000n,
        nonce,
        to: offrampTxData.to,
        type: "eip1559"
      });
    const backups: Record<string, { nonce: number; txData: `0x${string}` }> = {};
    for (let i = 1; i <= 4; i++) {
      backups[`backup${i}`] = { nonce: i, txData: await signOfframpTransfer(i) };
    }

    const userTxHash = world.evm.broadcastUserTransaction(Networks.Polygon, userWallet.address, {
      data: userTxData.data,
      to: userTxData.to,
      value: 0n
    });
    await updateRampViaApi(ramp.id, user.id, {
      additionalData: { squidRouterNoPermitTransferHash: userTxHash },
      presignedTxs: [
        {
          meta: { additionalTxs: backups },
          network: Networks.Polygon,
          nonce: 0,
          phase: "alfredpayOfframpTransfer",
          signer: ephemeral.address,
          txData: await signOfframpTransfer(0)
        }
      ]
    });

    world.evm.setNativeBalance(Networks.Polygon, ephemeral.address, parseUnits("2", 18));
    world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, ephemeral.address, inputAmountRaw);
    applyErc20TransfersToLedger();

    return {
      depositAddress: world.alfredpay.offrampDepositAddress,
      inputAmountRaw,
      quoteId: quote.id,
      rampId: ramp.id
    };
  }

  interface CrossChainOnrampSetup extends OnrampSetup {
    signedSquidApprove: `0x${string}`;
    signedSquidSwap: `0x${string}`;
  }

  /**
   * Cross-chain BUY setup via the HTTP API, mirroring the MXN cross-chain
   * corridor: quote to Arbitrum, register, presign the squid approve/swap
   * (Polygon) and destination transfer (Arbitrum) blueprints exactly as
   * issued, update — then script the fake world so the mint and gas are
   * already on the ephemeral and the broadcast squid swap credits the bridged
   * USDT on Arbitrum.
   */
  async function setUpCrossChainOnrampRamp(currency: CurrencyCase): Promise<CrossChainOnrampSetup> {
    world.alfredpay.onrampRate = currency.onrampRate;
    // The bridge leg swaps the 6-decimal Polygon mint token into 6-decimal
    // Arbitrum USDT; the fake route must report matching decimals.
    world.squidRouter.toTokenDecimals = 6;
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const destination = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;

    const user = await createTestUser();
    await createTestAlfredpayCustomer(user.id, { country: currency.country });
    const quote = await createQuoteViaApi({
      from: currency.rail,
      inputAmount: currency.onrampInputAmount,
      inputCurrency: currency.fiat,
      network: Networks.Arbitrum,
      outputCurrency: EvmToken.USDT,
      rampType: RampDirection.BUY,
      to: Networks.Arbitrum
    });
    const ramp = await registerViaApi(quote.id, user.id, [{ address: ephemeral.address, type: "EVM" }], {
      destinationAddress: destination
    });

    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    const mintAmountRaw = BigInt(persistedQuote?.metadata.alfredpayMint?.outputAmountRaw ?? "0");
    const bridgedAmountRaw = BigInt(persistedQuote?.metadata.evmToEvm?.outputAmountRaw ?? "0");
    expect(mintAmountRaw).toBeGreaterThan(0n);
    expect(bridgedAmountRaw).toBeGreaterThan(0n);

    const registered = await RampState.findByPk(ramp.id);
    const unsignedTxs: UnsignedTx[] = registered?.unsignedTxs ?? [];
    const approveBlueprint = blueprintOf(unsignedTxs, "squidRouterApprove");
    const swapBlueprint = blueprintOf(unsignedTxs, "squidRouterSwap");
    const transferBlueprint = blueprintOf(unsignedTxs, "destinationTransfer");
    expect(approveBlueprint.network).toBe(Networks.Polygon);
    expect(swapBlueprint.network).toBe(Networks.Polygon);
    expect(transferBlueprint.network).toBe(Networks.Arbitrum);

    const approvePresign = await presignWithBackups(ephemeral, approveBlueprint);
    const swapPresign = await presignWithBackups(ephemeral, swapBlueprint);
    const transferPresign = await presignWithBackups(ephemeral, transferBlueprint);
    await updateRampViaApi(ramp.id, user.id, { presignedTxs: [approvePresign, swapPresign, transferPresign] });

    const transferTxData = transferBlueprint.txData as unknown as { data: `0x${string}` };
    const { args } = decodeFunctionData({ abi: erc20Abi, data: transferTxData.data });
    const amountRaw = (args as [string, bigint])[1];

    world.evm.setNativeBalance(Networks.Polygon, ephemeral.address, parseUnits("2", 18));
    world.evm.setNativeBalance(Networks.Arbitrum, ephemeral.address, parseUnits("2", 18));
    world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, ephemeral.address, mintAmountRaw);
    applyErc20TransfersToLedger();
    const applyErc20Transfers = world.evm.onTransaction;
    world.evm.onTransaction = tx => {
      if (tx.serialized === swapPresign.txData) {
        world.evm.setErc20Balance(
          Networks.Arbitrum,
          USDT_ON_ARBITRUM,
          ephemeral.address,
          world.evm.erc20Balance(Networks.Arbitrum, USDT_ON_ARBITRUM, ephemeral.address) + bridgedAmountRaw
        );
        return;
      }
      applyErc20Transfers?.(tx);
    };

    return {
      amountRaw,
      destination,
      quoteId: quote.id,
      rampId: ramp.id,
      signedSquidApprove: approvePresign.txData,
      signedSquidSwap: swapPresign.txData
    };
  }

  interface CrossChainOfframpSetup extends OfframpSetup {
    ephemeralAddress: `0x${string}`;
    userWalletAddress: `0x${string}`;
  }

  /**
   * Cross-chain SELL setup via the HTTP API on the no-permit fallback (the
   * Alfredpay analog of the BRL cross-chain offramp's squid-hash flow): the
   * user broadcasts the squid approve + swap from their own wallet on
   * Arbitrum, the hashes are reported through /v1/ramp/update together with
   * the presigned Polygon deposit transfer, and squidRouterPermitExecute
   * verifies them against the blueprints before any ephemeral funds move.
   */
  async function setUpCrossChainOfframpRamp(currency: CurrencyCase): Promise<CrossChainOfframpSetup> {
    world.alfredpay.offrampRate = currency.offrampRate;
    // The user's squid leg swaps 6-decimal Arbitrum USDT into 6-decimal
    // Polygon USDT; the fake route must report matching decimals.
    world.squidRouter.toTokenDecimals = 6;
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const userWallet = privateKeyToAccount(generatePrivateKey());

    failNoncesProbe();

    const user = await createTestUser();
    await createTestAlfredpayCustomer(user.id, { country: currency.country });
    const quote = await createQuoteViaApi({
      from: Networks.Arbitrum,
      inputAmount: currency.offrampInputAmount,
      inputCurrency: EvmToken.USDT,
      network: Networks.Arbitrum,
      outputCurrency: currency.fiat,
      rampType: RampDirection.SELL,
      to: currency.rail
    });
    const ramp = await registerViaApi(quote.id, user.id, [{ address: ephemeral.address, type: "EVM" }], {
      fiatAccountId: "test-fiat-account-1",
      walletAddress: userWallet.address
    });

    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    const inputAmountRaw = BigInt(persistedQuote?.metadata.alfredpayOfframp?.inputAmountRaw ?? "0");
    expect(inputAmountRaw).toBeGreaterThan(0n);

    const registered = await RampState.findByPk(ramp.id);
    const allUnsignedTxs: UnsignedTx[] = registered?.unsignedTxs ?? [];
    // The cross-chain no-permit branch: user-wallet squid approve + swap on
    // the source chain instead of the direct Polygon transfer.
    expect(allUnsignedTxs.some(tx => tx.phase === "squidRouterNoPermitTransfer")).toBe(false);
    const approveBlueprint = blueprintOf(allUnsignedTxs, "squidRouterNoPermitApprove");
    const swapBlueprint = blueprintOf(allUnsignedTxs, "squidRouterNoPermitSwap");
    const offrampTransferBlueprint = blueprintOf(allUnsignedTxs, "alfredpayOfframpTransfer");
    expect(approveBlueprint.network).toBe(Networks.Arbitrum);
    expect(swapBlueprint.network).toBe(Networks.Arbitrum);
    expect(approveBlueprint.signer.toLowerCase()).toBe(userWallet.address.toLowerCase());
    expect(swapBlueprint.signer.toLowerCase()).toBe(userWallet.address.toLowerCase());

    // The user broadcasts the squid leg from their own wallet; the frontend
    // reports the hashes together with the presigned deposit transfer.
    const approveHash = broadcastUserBlueprint(userWallet, approveBlueprint);
    const swapHash = broadcastUserBlueprint(userWallet, swapBlueprint);
    await updateRampViaApi(ramp.id, user.id, {
      additionalData: { squidRouterNoPermitApproveHash: approveHash, squidRouterNoPermitSwapHash: swapHash },
      presignedTxs: [await presignWithBackups(ephemeral, offrampTransferBlueprint)]
    });

    // The squid-bridged USDT has already landed on the Polygon ephemeral,
    // which also has Polygon gas.
    world.evm.setNativeBalance(Networks.Polygon, ephemeral.address, parseUnits("2", 18));
    world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, ephemeral.address, inputAmountRaw);
    applyErc20TransfersToLedger();

    return {
      depositAddress: world.alfredpay.offrampDepositAddress,
      ephemeralAddress: ephemeral.address,
      inputAmountRaw,
      quoteId: quote.id,
      rampId: ramp.id,
      userWalletAddress: userWallet.address as `0x${string}`
    };
  }

  for (const currency of CURRENCY_CASES) {
    it(
      `${currency.fiat} onramp (${currency.rail} → USDT on Polygon) completes and maps to Alfredpay ${currency.alfredpayCurrency}`,
      async () => {
        // The in-memory anchor keeps orders across tests in this file.
        const ordersBefore = world.alfredpay.onrampOrders.length;
        const setup = await setUpOnrampRamp(currency);

        await phaseProcessor.processRamp(setup.rampId);

        const final = await RampState.findByPk(setup.rampId);
        expect(final?.currentPhase).toBe("complete");
        expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(ONRAMP_PHASES);
        expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });

        // The per-currency contract with the anchor: the order carries the
        // Alfredpay currency code for this fiat and mints USDT.
        expect(world.alfredpay.onrampOrders.length).toBe(ordersBefore + 1);
        const order = world.alfredpay.onrampOrders[world.alfredpay.onrampOrders.length - 1];
        expect(order.fromCurrency).toBe(currency.alfredpayCurrency as never);
        expect(order.toCurrency).toBe("USDT" as never);
        expect(Number(order.amount)).toBe(Number(currency.onrampInputAmount));

        const quoteRow = await QuoteTicket.findByPk(setup.quoteId);
        expect(quoteRow?.status).toBe("consumed");
        expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.destination)).toBe(setup.amountRaw);
      },
      30000
    );

    it(
      `${currency.fiat} offramp (USDT on Polygon → ${currency.rail}) completes and maps to Alfredpay ${currency.alfredpayCurrency}`,
      async () => {
        // The in-memory anchor keeps orders across tests in this file.
        const offrampOrdersBefore = world.alfredpay.offrampOrders.length;
        const setup = await setUpOfframpRamp(currency);

        await phaseProcessor.processRamp(setup.rampId);

        const final = await RampState.findByPk(setup.rampId);
        expect(final?.currentPhase).toBe("complete");
        expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(OFFRAMP_PHASES);
        expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });

        // Per-currency contract with the anchor on the way out: USDT in, this
        // fiat's Alfredpay currency code out, deposit received in full.
        expect(world.alfredpay.offrampOrders.length).toBe(offrampOrdersBefore + 1);
        const order = world.alfredpay.offrampOrders[world.alfredpay.offrampOrders.length - 1];
        expect(order.fromCurrency).toBe("USDT" as never);
        expect(order.toCurrency).toBe(currency.alfredpayCurrency as never);
        expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.depositAddress)).toBe(
          setup.inputAmountRaw
        );

        const quoteRow = await QuoteTicket.findByPk(setup.quoteId);
        expect(quoteRow?.status).toBe("consumed");
      },
      30000
    );

    it(
      `${currency.fiat} cross-chain onramp (${currency.rail} → Polygon mint → USDT on Arbitrum) bridges via squid and completes`,
      async () => {
        const ordersBefore = world.alfredpay.onrampOrders.length;
        const setup = await setUpCrossChainOnrampRamp(currency);

        // Registration requested a Polygon mint-token → Arbitrum USDT route
        // for the ephemeral.
        const registrationRoute = world.squidRouter.requestedRoutes.find(
          route =>
            route.fromToken.toLowerCase() === ALFREDPAY_ERC20_TOKEN.toLowerCase() &&
            route.toToken.toLowerCase() === USDT_ON_ARBITRUM.toLowerCase() &&
            route.fromChain === "137" &&
            route.toChain === "42161"
        );
        expect(registrationRoute, "registration should request a Polygon→Arbitrum route").toBeDefined();

        await phaseProcessor.processRamp(setup.rampId);

        const final = await RampState.findByPk(setup.rampId);
        expect(final?.currentPhase).toBe("complete");
        expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(CROSS_CHAIN_ONRAMP_PHASES);
        expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
        expect(final?.state.squidRouterApproveHash).toBeTruthy();
        expect(final?.state.squidRouterSwapHash).toBeTruthy();

        // The order still carries this currency's Alfredpay code, and the
        // destination received exactly the quoted USDT on ARBITRUM.
        expect(world.alfredpay.onrampOrders.length).toBe(ordersBefore + 1);
        const order = world.alfredpay.onrampOrders[world.alfredpay.onrampOrders.length - 1];
        expect(order.fromCurrency).toBe(currency.alfredpayCurrency as never);
        expect(world.evm.sentTransactions.filter(tx => tx.serialized === setup.signedSquidApprove).length).toBe(1);
        expect(world.evm.sentTransactions.filter(tx => tx.serialized === setup.signedSquidSwap).length).toBe(1);
        expect(world.evm.erc20Balance(Networks.Arbitrum, USDT_ON_ARBITRUM, setup.destination)).toBe(setup.amountRaw);

        const quoteRow = await QuoteTicket.findByPk(setup.quoteId);
        expect(quoteRow?.status).toBe("consumed");
      },
      30000
    );

    it(`${currency.fiat} onramp quote beyond the per-currency maximum is rejected`, async () => {
      const details = getAnyFiatTokenDetails(currency.fiat);
      const maxBuyUnits = multiplyByPowerOfTen(Big(details.maxBuyAmountRaw), -details.decimals);

      const response = await app.request("/v1/quotes", {
        body: JSON.stringify({
          from: currency.rail,
          inputAmount: maxBuyUnits.plus(1).toFixed(),
          inputCurrency: currency.fiat,
          network: Networks.Polygon,
          outputCurrency: EvmToken.USDT,
          rampType: RampDirection.BUY,
          to: Networks.Polygon
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { message?: string; error?: string };
      expect(JSON.stringify(body).toLowerCase()).toContain("limit");
    });

    it(
      `transient failure (${currency.fiat}): an RPC outage on the destination transfer is recoverable and the onramp still completes`,
      async () => {
        const setup = await setUpOnrampRamp(currency);
        // The first broadcast of this corridor is the destination transfer.
        world.evm.failNextSends = 1;
        world.evm.sendFailureMessage = "FakeEvm: scripted RPC outage";

        await phaseProcessor.processRamp(setup.rampId);

        const final = await RampState.findByPk(setup.rampId);
        expect(final?.currentPhase).toBe("complete");
        expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(ONRAMP_PHASES);
        expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });

        // The scripted outage was recorded as a recoverable destinationTransfer
        // error, and after the retry the destination was still paid in full.
        const outageLogs = final?.errorLogs.filter(log => log.error.includes("scripted RPC outage")) ?? [];
        expect(outageLogs.length).toBeGreaterThanOrEqual(1);
        expect(outageLogs.every(log => log.phase === "destinationTransfer")).toBe(true);
        expect(outageLogs.some(log => log.recoverable === true)).toBe(true);
        expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.destination)).toBe(setup.amountRaw);
      },
      30000
    );

    it(
      `unrecoverable failure (${currency.fiat}): a FAILED Alfredpay offramp order fails the ramp without completing`,
      async () => {
        const setup = await setUpOfframpRamp(currency);
        // The anchor reports the order FAILED while the transfer phase polls it.
        world.alfredpay.offrampStatus = AlfredpayOfframpStatus.FAILED;

        await phaseProcessor.processRamp(setup.rampId);

        const final = await RampState.findByPk(setup.rampId);
        expect(final?.currentPhase).toBe("failed");
        expect(final?.phaseHistory.map(entry => entry.phase)).not.toContain("complete");
        expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      },
      30000
    );
  }

  for (const currency of CROSS_CHAIN_OFFRAMP_CASES) {
    it(
      `${currency.fiat} cross-chain offramp (USDT on Arbitrum → squid → Polygon → ${currency.rail}) verifies the user's squid txs and completes`,
      async () => {
        const offrampOrdersBefore = world.alfredpay.offrampOrders.length;
        const setup = await setUpCrossChainOfframpRamp(currency);

        // Registration requested an Arbitrum USDT → Polygon USDT route from
        // the user's wallet, delivering to the ephemeral.
        const registrationRoute = world.squidRouter.requestedRoutes.find(
          route =>
            route.fromToken.toLowerCase() === USDT_ON_ARBITRUM.toLowerCase() &&
            route.toToken.toLowerCase() === ALFREDPAY_ERC20_TOKEN.toLowerCase() &&
            route.toAddress?.toLowerCase() === setup.ephemeralAddress.toLowerCase()
        );
        expect(registrationRoute, "registration should request an Arbitrum→Polygon USDT route to the ephemeral").toBeDefined();
        expect(registrationRoute?.fromChain).toBe("42161");
        expect(registrationRoute?.toChain).toBe("137");
        expect(registrationRoute?.fromAddress.toLowerCase()).toBe(setup.userWalletAddress.toLowerCase());

        await phaseProcessor.processRamp(setup.rampId);

        const final = await RampState.findByPk(setup.rampId);
        expect(final?.currentPhase).toBe("complete");
        expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(OFFRAMP_PHASES);
        expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
        expect(final?.state.isNoPermitFallback).toBe(true);
        expect(final?.state.isDirectTransfer).toBeFalsy();

        // Per-currency contract with the anchor on the way out, unchanged by
        // the cross-chain source: USDT in, this fiat's code out, deposit paid
        // in full on Polygon.
        expect(world.alfredpay.offrampOrders.length).toBe(offrampOrdersBefore + 1);
        const order = world.alfredpay.offrampOrders[world.alfredpay.offrampOrders.length - 1];
        expect(order.fromCurrency).toBe("USDT" as never);
        expect(order.toCurrency).toBe(currency.alfredpayCurrency as never);
        expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.depositAddress)).toBe(
          setup.inputAmountRaw
        );

        const quoteRow = await QuoteTicket.findByPk(setup.quoteId);
        expect(quoteRow?.status).toBe("consumed");
      },
      30000
    );
  }
});
