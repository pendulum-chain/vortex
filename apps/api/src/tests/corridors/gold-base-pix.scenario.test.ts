import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  AveniaTicketStatus,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  Networks,
  type PresignedTx,
  RampDirection,
  type RampPhase,
  type SignedTypedData,
  signUnsignedTransactions,
  type UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { parseEther, parseSignature, parseTransaction, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getEvmFundingAccount } from "../../api/services/phases/blocks/core/evm-funding";
import { BASE_PAXG_ADDRESS, BASE_USDC_ADDRESS } from "../../api/services/phases/blocks/core/gold-base";
import { getBlockMetadata } from "../../api/services/phases/blocks/core/metadata";
import { AveniaMintContext } from "../../api/services/phases/blocks/phases/avenia-mint/simulation";
import { AveniaOfframpPayoutContext } from "../../api/services/phases/blocks/phases/avenia-offramp-payout/simulation";
import { DistributeFeesContext } from "../../api/services/phases/blocks/phases/distribute-fees/simulation";
import { NablaSwapContext } from "../../api/services/phases/blocks/phases/nabla-swap/simulation";
import { config } from "../../config/vars";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestTaxId, createTestUser, updatePartnerPricing } from "../../test-utils/factories";
import { type FakeWorld, installFakeChainIdRpc, installFakeWorld } from "../../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../../test-utils/fake-world/fake-auth";
import { applyGoldRouterTx, scriptGoldBase } from "../../test-utils/fake-world/gold-base";
import { TokenLedger } from "../../test-utils/fake-world/robinhood-chain";
import { startTestApp, type TestApp } from "../../test-utils/test-app";

const USDC = BASE_USDC_ADDRESS;
const PAXG = BASE_PAXG_ADDRESS;
const BRLA = evmTokenConfig[Networks.Base][EvmToken.BRLA]?.erc20AddressSourceChain as `0x${string}`;
const TAX_ID = "12345678901";
const RECEIVER_TAX_ID = "12345678900";
const PIX_KEY = "test-pix-key";
const FEE_PAYOUT = "0x000000000000000000000000000000000000fee5";
const FUNDING = getEvmFundingAccount(Networks.Base).address;
const PRICE_USD = 4000n;

const BUY_PHASES: RampPhase[] = [
  "initial",
  "brlaOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "distributeFees",
  "subsidizePostSwap",
  "uniswapApprove",
  "uniswapSwap",
  "goldSettlementTopUp",
  "destinationTransfer",
  "complete"
];
const SELL_PHASES: RampPhase[] = [
  "initial",
  "fundEphemeral",
  "goldPermitTransfer",
  "uniswapApprove",
  "uniswapSwap",
  "distributeFees",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "subsidizePostSwap",
  "brlaPayoutOnBase",
  "complete"
];

/**
 * Gold on Base against Pix. Quote, registration, presign validation and start go through the real HTTP API with the
 * shared signer, then the real PhaseProcessor drives the real executors. Only the world is fake, and it enforces
 * token semantics, nonces and gas (see TokenLedger).
 */
describe("Gold on Base with Pix: real executors, simulated chain and provider", () => {
  let world: FakeWorld, app: TestApp, auth: { restore(): void }, restoreRpc: () => void;
  const { enabledDirections } = config.gold;
  beforeAll(async () => {
    world = installFakeWorld();
    restoreRpc = installFakeChainIdRpc();
    auth = installFakeSupabaseAuth();
    await setupTestDatabase();
    app = await startTestApp();
  });
  afterAll(async () => {
    config.gold.enabledDirections = enabledDirections;
    await app?.close();
    auth?.restore();
    restoreRpc?.();
    world?.restore();
  });
  beforeEach(async () => {
    await resetTestDatabase();
    // The fee distribution pays the vortex partner's EVM address.
    for (const direction of [RampDirection.BUY, RampDirection.SELL]) {
      await updatePartnerPricing("vortex", direction, { payoutAddressEvm: FEE_PAYOUT });
    }
    config.gold.enabledDirections = [RampDirection.BUY, RampDirection.SELL];
    world.evm.strictReceipts = true;
    world.evm.failNextSends = 0;
    world.evm.onTransaction = undefined;
    world.evm.revertedReceiptHashes.clear();
    world.evm.sentTransactions.length = 0;
    world.evm.setFeeEstimate(Networks.Base, 6_500_000n, 1_000_000n);
    world.evm.setNativeBalance(Networks.Base, FUNDING, parseEther("10"));
    world.evm.setErc20Balance(Networks.Base, USDC, FUNDING, parseUnits("10000", 6));
    world.evm.setErc20Balance(Networks.Base, USDC, FEE_PAYOUT, 0n);
    world.brla.onPixOutputTicket = undefined;
    world.brla.accountBalances = { BRLA: 1_000_000, USDC: 0, USDM: 0, USDT: 0 };
    world.brla.payinTicketStatus = AveniaTicketStatus.PAID;
    // The in-memory ledger outlives a test, so a shared payout recipient would accumulate.
    world.brla.subaccountEvmWallet = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    // Nabla on Base at 5 BRL per USD: BRLA has 18 decimals, USDC 6.
    world.evm.onReadContract = (_network, params) => {
      if (params.functionName !== "quoteSwapExactTokensForTokens") return undefined;
      const [amountIn, [tokenIn]] = params.args as [bigint, string[]];
      return tokenIn.toLowerCase() === BRLA.toLowerCase() ? amountIn / 5n / 10n ** 12n : amountIn * 5n * 10n ** 12n;
    };
    scriptGoldBase(world.evm, PRICE_USD);
  });

  async function post<Body>(path: string, body: unknown, userId?: string): Promise<Body> {
    const response = await app.request(path, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...(userId ? { Authorization: `Bearer ${testUserToken(userId)}` } : {}) },
      method: "POST"
    });
    expect(response.status, `${path} failed: ${await response.clone().text()}`).toBeLessThan(300);
    return (await response.json()) as Body;
  }

  async function settle(rampId: string): Promise<RampState> {
    const deadline = Date.now() + 60_000;
    for (;;) {
      const ramp = (await RampState.findByPk(rampId)) as RampState;
      if (ramp.currentPhase !== "initial" && !ramp.processingLock.locked) return ramp;
      if (Date.now() > deadline) throw new Error(`Ramp stuck in ${ramp.currentPhase}`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  const balance = (token: string, holder: string) => world.evm.erc20Balance(Networks.Base, token, holder);

  /** Broadcasts follow the ledger; on top of it the Nabla swap trades at its quote and the pinned pool at its price. */
  function scriptChain(
    ledger: TokenLedger,
    ephemeral: string,
    nablaSwap: string,
    nabla: { inputRaw: bigint; inputToken: string; outputRaw: bigint; outputToken: string },
    fillBps = 10_000n
  ): void {
    world.evm.onTransaction = tx => {
      ledger.apply(tx);
      if (tx.serialized === nablaSwap) {
        const router = parseTransaction(tx.serialized as `0x${string}`).to as string;
        if (ledger.pull(tx, nabla.inputToken, ephemeral, router, router, nabla.inputRaw)) {
          ledger.credit(Networks.Base, nabla.outputToken, ephemeral, nabla.outputRaw);
        }
      }
      applyGoldRouterTx(world.evm, ledger, tx, ephemeral, PRICE_USD, fillBps);
    };
  }
  const newLedger = (ephemeral: string) =>
    new TokenLedger(world.evm, PRICE_USD, ephemeral, {
      [PAXG.toLowerCase()]: { name: "Paxos Gold", version: "1" },
      [USDC.toLowerCase()]: { name: "USD Coin", version: "2" }
    });

  it(
    "buys PAXG with Pix: mint, Nabla, the pinned pool, and the exact quoted amount to the buyer",
    async () => {
      const secret = generatePrivateKey();
      const ephemeral = privateKeyToAccount(secret);
      const destination = privateKeyToAccount(generatePrivateKey()).address;
      const user = await createTestUser();
      await createTestTaxId(user.id, { taxId: TAX_ID });

      const quote = await post<{ id: string; outputAmount: string }>("/v1/quotes", {
        destinationAddress: destination,
        from: "pix",
        inputAmount: "500",
        inputCurrency: FiatToken.BRL,
        network: Networks.Base,
        outputCurrency: "PAXG",
        rampType: RampDirection.BUY,
        to: Networks.Base
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
      const presignedTxs = await signUnsignedTransactions(registered.unsignedTxs, {
        evmEphemeral: { address: ephemeral.address, secret }
      });
      const updated = await post<{ depositQrCode?: string }>("/v1/ramp/update", { presignedTxs, rampId: registered.id }, user.id);
      expect(updated.depositQrCode).toBeTruthy();

      const metadata = ((await QuoteTicket.findByPk(quote.id)) as QuoteTicket).metadata;
      const nabla = getBlockMetadata(metadata, NablaSwapContext);
      const mint = getBlockMetadata(metadata, AveniaMintContext);
      const ledger = newLedger(ephemeral.address);
      // The Pix is paid and Avenia mints to the ephemeral.
      world.brla.onPixOutputTicket = ({ walletAddress }) => {
        if (walletAddress) {
          ledger.credit(Networks.Base, BRLA, walletAddress, parseUnits(new Big(mint.mint.outputAmountDecimal).toFixed(2, 0), 18));
        }
      };
      scriptChain(ledger, ephemeral.address, presignedTxs.find(tx => tx.phase === "nablaSwap")?.txData as string, {
        inputRaw: BigInt(nabla.inputAmountForSwapRaw),
        inputToken: BRLA,
        outputRaw: BigInt(nabla.outputAmountRaw),
        outputToken: USDC
      });

      await post("/v1/ramp/start", { rampId: registered.id }, user.id);
      const final = await settle(registered.id);
      expect(final.currentPhase, JSON.stringify(final.errorLogs)).toBe("complete");
      expect(final.phaseHistory.map(entry => entry.phase)).toEqual(BUY_PHASES);
      expect(world.evm.revertedReceiptHashes.size).toBe(0);
      expect(balance(PAXG, destination)).toBe(parseUnits(quote.outputAmount, 18));
      expect(balance(USDC, FEE_PAYOUT)).toBe(parseUnits(getBlockMetadata(metadata, DistributeFeesContext).totalFeesUsd, 6));
    },
    90_000
  );

  it(
    "sells PAXG for Pix: one permit, the pinned pool, Nabla, and the quoted BRL paid out",
    async () => {
      const owner = privateKeyToAccount(generatePrivateKey());
      const secret = generatePrivateKey();
      const ephemeral = privateKeyToAccount(secret);
      const user = await createTestUser();
      await createTestTaxId(user.id, { taxId: TAX_ID });
      world.evm.setNativeBalance(Networks.Base, owner.address, 0n);
      world.evm.setErc20Balance(Networks.Base, PAXG, owner.address, parseUnits("0.05", 18));
      const pixOutBefore = world.brla.pixOutputTickets.length;

      const quote = await post<{ gasless?: boolean; id: string; outputAmount: string }>("/v1/quotes", {
        from: Networks.Base,
        inputAmount: "0.05",
        inputCurrency: "PAXG",
        network: Networks.Base,
        outputCurrency: FiatToken.BRL,
        rampType: RampDirection.SELL,
        to: "pix"
      });
      expect(quote.gasless).toBe(true);
      const registered = await post<{ id: string; unsignedTxs: UnsignedTx[] }>(
        "/v1/ramp/register",
        {
          additionalData: { pixDestination: PIX_KEY, receiverTaxId: RECEIVER_TAX_ID, taxId: TAX_ID, walletAddress: owner.address },
          quoteId: quote.id,
          signingAccounts: [{ address: ephemeral.address, type: "EVM" }]
        },
        user.id
      );
      const presignedTxs = await signUnsignedTransactions(registered.unsignedTxs, {
        evmEphemeral: { address: ephemeral.address, secret }
      });
      const metadata = ((await QuoteTicket.findByPk(quote.id)) as QuoteTicket).metadata;
      const nabla = getBlockMetadata(metadata, NablaSwapContext);
      const payout = getBlockMetadata(metadata, AveniaOfframpPayoutContext);
      const ledger = newLedger(ephemeral.address);
      scriptChain(ledger, ephemeral.address, presignedTxs.find(tx => tx.phase === "nablaSwap")?.txData as string, {
        inputRaw: BigInt(nabla.inputAmountForSwapRaw),
        inputToken: USDC,
        outputRaw: BigInt(nabla.outputAmountRaw),
        outputToken: BRLA
      });

      const released = await post<{ unsignedTxs: UnsignedTx[] }>("/v1/ramp/update", { presignedTxs, rampId: registered.id }, user.id);
      const permit = released.unsignedTxs.find(tx => tx.signer.toLowerCase() === owner.address.toLowerCase()) as UnsignedTx;
      expect(permit.phase).toBe("goldPermitTransfer");
      const payload = permit.txData as SignedTypedData;
      const { r, s, v } = parseSignature(await owner.signTypedData(payload as Parameters<typeof owner.signTypedData>[0]));
      const authorization = {
        ...permit,
        txData: [{ ...payload, signature: { deadline: Number(payload.message.deadline), r, s, v: Number(v) } }]
      } as PresignedTx;
      await post("/v1/ramp/update", { presignedTxs: [authorization], rampId: registered.id }, user.id);

      await post("/v1/ramp/start", { rampId: registered.id }, user.id);
      const final = await settle(registered.id);
      expect(final.currentPhase, JSON.stringify(final.errorLogs)).toBe("complete");
      expect(final.phaseHistory.map(entry => entry.phase)).toEqual(SELL_PHASES);
      expect(world.evm.revertedReceiptHashes.size).toBe(0);
      // The seller gave up exactly what they sold and paid no gas.
      expect(balance(PAXG, owner.address)).toBe(0n);
      expect(balance(PAXG, ephemeral.address)).toBe(0n);
      expect(world.evm.nativeBalance(Networks.Base, owner.address)).toBe(0n);
      // The Pix pays the quoted BRL, out of BRLA that reached the Avenia wallet.
      expect(balance(BRLA, world.brla.subaccountEvmWallet)).toBe(BigInt(payout.transferAmountRaw));
      expect(world.brla.pixOutputTickets).toHaveLength(pixOutBefore + 1);
      expect(world.brla.payoutQuoteAmounts.at(-1)).toBe(new Big(quote.outputAmount).round(2, 0).toString());
      expect(final.state.payOutTicketId).toBeTruthy();
    },
    90_000
  );
});
