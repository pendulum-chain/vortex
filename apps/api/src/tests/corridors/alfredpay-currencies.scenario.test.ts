import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_ERC20_TOKEN,
  AlfredPayCountry,
  AlfredpayOfframpStatus,
  AlfredpayOnrampStatus,
  EvmToken,
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

/**
 * Parameterized happy-path scenarios for the Alfredpay corridors beyond MXN:
 * USD (ach), COP (ach) and ARS (cbu), each in both directions. The failure and
 * security variants live in the MXN corridor files — the phase handlers are
 * shared, so what these tests protect is the per-currency configuration:
 * rails, limits, and the fiat↔Alfredpay currency mapping.
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

  for (const currency of CURRENCY_CASES) {
    it(
      `${currency.fiat} onramp (${currency.rail} → USDT on Polygon) completes and maps to Alfredpay ${currency.alfredpayCurrency}`,
      async () => {
        world.alfredpay.onrampRate = currency.onrampRate;
        // The in-memory anchor keeps orders across tests in this file.
        const ordersBefore = world.alfredpay.onrampOrders.length;
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

        await phaseProcessor.processRamp(ramp.id);

        const final = await RampState.findByPk(ramp.id);
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

        const quoteRow = await QuoteTicket.findByPk(quote.id);
        expect(quoteRow?.status).toBe("consumed");
        expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, destination)).toBe(amountRaw);
      },
      30000
    );

    it(
      `${currency.fiat} offramp (USDT on Polygon → ${currency.rail}) completes and maps to Alfredpay ${currency.alfredpayCurrency}`,
      async () => {
        world.alfredpay.offrampRate = currency.offrampRate;
        // The in-memory anchor keeps orders across tests in this file.
        const offrampOrdersBefore = world.alfredpay.offrampOrders.length;
        const ephemeral = privateKeyToAccount(generatePrivateKey());
        const userWallet = privateKeyToAccount(generatePrivateKey());

        // Polygon USDT has no EIP-2612 support: the nonces() probe fails as a
        // contract-call error, steering registration onto the no-permit path.
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
        const signedOfframpTransfer = await signOfframpTransfer(0);

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
              txData: signedOfframpTransfer
            }
          ]
        });

        world.evm.setNativeBalance(Networks.Polygon, ephemeral.address, parseUnits("2", 18));
        world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, ephemeral.address, inputAmountRaw);
        applyErc20TransfersToLedger();
        const depositAddress = world.alfredpay.offrampDepositAddress;

        await phaseProcessor.processRamp(ramp.id);

        const final = await RampState.findByPk(ramp.id);
        expect(final?.currentPhase).toBe("complete");
        expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(OFFRAMP_PHASES);
        expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });

        // Per-currency contract with the anchor on the way out: USDT in, this
        // fiat's Alfredpay currency code out, deposit received in full.
        expect(world.alfredpay.offrampOrders.length).toBe(offrampOrdersBefore + 1);
        const order = world.alfredpay.offrampOrders[world.alfredpay.offrampOrders.length - 1];
        expect(order.fromCurrency).toBe("USDT" as never);
        expect(order.toCurrency).toBe(currency.alfredpayCurrency as never);
        expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, depositAddress)).toBe(inputAmountRaw);

        const quoteRow = await QuoteTicket.findByPk(quote.id);
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
  }

  it(
    "transient failure (USD): an RPC outage on the destination transfer is recoverable and the onramp still completes",
    async () => {
      const currency = CURRENCY_CASES[0]; // USD/ach
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
      const signedTransfer = await signTransfer(0);
      await updateRampViaApi(ramp.id, user.id, {
        presignedTxs: [
          {
            meta: { additionalTxs: backups },
            network: Networks.Polygon,
            nonce: 0,
            phase: "destinationTransfer",
            signer: ephemeral.address,
            txData: signedTransfer
          }
        ]
      });

      world.evm.setNativeBalance(Networks.Polygon, ephemeral.address, parseUnits("2", 18));
      world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, ephemeral.address, mintAmountRaw);
      applyErc20TransfersToLedger();
      // The first broadcast of this corridor is the destination transfer.
      world.evm.failNextSends = 1;
      world.evm.sendFailureMessage = "FakeEvm: scripted RPC outage";

      await phaseProcessor.processRamp(ramp.id);

      const final = await RampState.findByPk(ramp.id);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      const outageLogs = final?.errorLogs.filter(log => log.error.includes("scripted RPC outage")) ?? [];
      expect(outageLogs.length).toBeGreaterThanOrEqual(1);
      expect(outageLogs.some(log => log.recoverable === true)).toBe(true);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, destination)).toBe(amountRaw);
    },
    30000
  );

  it(
    "unrecoverable failure (ARS): a FAILED Alfredpay offramp order fails the ramp without paying out",
    async () => {
      const currency = CURRENCY_CASES[2]; // ARS/cbu
      world.alfredpay.offrampRate = currency.offrampRate;
      const ephemeral = privateKeyToAccount(generatePrivateKey());
      const userWallet = privateKeyToAccount(generatePrivateKey());

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

      const registered = await RampState.findByPk(ramp.id);
      const allUnsignedTxs: UnsignedTx[] = registered?.unsignedTxs ?? [];
      const userTxData = allUnsignedTxs.find(tx => tx.phase === "squidRouterNoPermitTransfer")?.txData as unknown as {
        to: `0x${string}`;
        data: `0x${string}`;
      };
      const offrampTxData = allUnsignedTxs.find(tx => tx.phase === "alfredpayOfframpTransfer")?.txData as unknown as {
        to: `0x${string}`;
        data: `0x${string}`;
      };

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
      // The anchor reports the order FAILED while the transfer phase polls it.
      world.alfredpay.offrampStatus = AlfredpayOfframpStatus.FAILED;

      await phaseProcessor.processRamp(ramp.id);

      const final = await RampState.findByPk(ramp.id);
      expect(final?.currentPhase).toBe("failed");
      expect(final?.phaseHistory.map(entry => entry.phase)).not.toContain("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
    },
    30000
  );
});
