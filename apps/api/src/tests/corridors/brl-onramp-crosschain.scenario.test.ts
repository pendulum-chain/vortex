import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  EvmToken,
  type EvmNetworks,
  evmTokenConfig,
  FiatToken,
  Networks,
  RampDirection,
  type RampPhase,
  signUnsignedTransactions,
  type UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { decodeFunctionData, erc20Abi, parseTransaction, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import phaseProcessor from "../../api/services/phases/phase-processor";
import { getBlockMetadata, getFlowMetadata } from "../../api/services/phases/blocks/core/metadata";
import { NablaSwapContext } from "../../api/services/phases/blocks/phases/nabla-swap/simulation";
import { SquidRouterSwapContext } from "../../api/services/phases/blocks/phases/squid-router-swap/simulation";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestTaxId, createTestUser, updatePartnerPricing } from "../../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../../test-utils/test-app";

function requireToken(network: Networks.Base | Networks.Arbitrum, token: EvmToken) {
  const details = evmTokenConfig[network][token];
  if (!details) {
    throw new Error(`${token} token config missing for ${network}`);
  }
  return details;
}
const USDC_ON_BASE = requireToken(Networks.Base, EvmToken.USDC).erc20AddressSourceChain as `0x${string}`;
const USDC_ON_ARBITRUM = requireToken(Networks.Arbitrum, EvmToken.USDC).erc20AddressSourceChain as `0x${string}`;
const BRLA_ON_BASE = requireToken(Networks.Base, EvmToken.BRLA).erc20AddressSourceChain as `0x${string}`;

const TAX_ID = "12345678901";
const BASE_CHAIN_ID_HEX = "0x2105";
const ARBITRUM_CHAIN_ID_HEX = "0xa4b1";

function installChainIdShim(): { restore: () => void } {
  const guardedFetch = globalThis.fetch;
  const shim = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (typeof init?.body === "string") {
      try {
        const payload = JSON.parse(init.body) as { id?: number; method?: string };
        if (payload.method === "eth_chainId") {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          const chainId = url.includes("base") ? BASE_CHAIN_ID_HEX : ARBITRUM_CHAIN_ID_HEX;
          return Response.json({ id: payload.id ?? 1, jsonrpc: "2.0", result: chainId });
        }
      } catch {
        // Not a JSON-RPC request; retain the hermetic fetch guard below.
      }
    }
    return guardedFetch(input, init);
  }) as typeof fetch;
  globalThis.fetch = Object.assign(shim, guardedFetch);
  return {
    restore: () => {
      globalThis.fetch = guardedFetch;
    }
  };
}

// Unlike the direct pix→BRLA-on-Base corridor, the full swap-and-bridge chain
// executes here: Nabla swaps the minted BRLA into USDC on Base, the squid
// approve+swap bridge it to Arbitrum, and squidRouterPay settles via the
// destination-chain balance check before the Arbitrum payout.
const HAPPY_PATH_PHASES: RampPhase[] = [
  "initial",
  "brlaOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "distributeFees",
  "subsidizePostSwap",
  "squidRouterSwap",
  "squidRouterPay",
  "finalSettlementSubsidy",
  "destinationTransfer",
  "complete"
];

interface CorridorSetup {
  rampId: string;
  quoteId: string;
  /** Raw (6-decimal) USDC amount the presigned destination transfer pays out on Arbitrum. */
  amountRaw: bigint;
  /** Raw (18-decimal) BRLA amount the Nabla swap consumes on Base. */
  swapInputRaw: bigint;
  /** Raw (6-decimal) USDC amount the Nabla swap yields on Base. */
  swapOutputRaw: bigint;
  /** Raw (6-decimal) USDC amount the squid bridge delivers on Arbitrum. */
  bridgedAmountRaw: bigint;
  signedNablaSwap: `0x${string}`;
  signedSquidApprove: `0x${string}`;
  signedSquidSwap: `0x${string}`;
  signedTransfer: `0x${string}`;
  ephemeral: PrivateKeyAccount;
  destination: `0x${string}`;
}

interface DestinationFundingExpectation {
  initialBalanceRaw: bigint;
  liabilityRaw: bigint;
  shortfallRaw: bigint;
}

/**
 * Corridor scenario tests for the CROSS-CHAIN BRL onramp (pix → BRLA minted on
 * Base → Nabla swap to USDC → SquidRouter bridge → USDC on Arbitrum). This is
 * the route the resolver picks for any BRL BUY to a non-Base EVM destination
 * (OnRampAveniaToEvmBase with the Base→EVM squid leg): quote and registration
 * go through the real HTTP API, then the REAL PhaseProcessor drives the whole
 * chain — mint, Nabla swap, squid approve+swap on Base, bridge settlement on
 * Arbitrum, destination payout — against the fake external world. The direct
 * BRL corridor and the MXN cross-chain corridor each cover only half of this
 * path; failure modes of the shared handlers are covered in those files.
 */
describe("BRL onramp cross-chain corridor (pix → Base mint+swap → USDC on Arbitrum)", () => {
  let world: FakeWorld;
  let auth: { restore: () => void };
  let chainIdShim: { restore: () => void };
  let app: TestApp;

  beforeAll(async () => {
    world = installFakeWorld();
    chainIdShim = installChainIdShim();
    auth = installFakeSupabaseAuth();
    await setupTestDatabase();
    app = await startTestApp();
  });

  afterAll(async () => {
    await app?.close();
    auth?.restore();
    chainIdShim?.restore();
    world?.restore();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    // The EVM fee distribution transaction builder requires the vortex
    // partner's EVM payout address even when the resulting fees are zero.
    await updatePartnerPricing("vortex", RampDirection.BUY, { payoutAddressEvm: "0x000000000000000000000000000000000000fee5" });
    world.evm.failNextSends = 0;
    world.evm.setFeeEstimate(Networks.Arbitrum, 1_000_000_000n);
    world.evm.setFeeEstimate(Networks.Base, 1_000_000_000n);
    world.evm.onTransaction = undefined;
    world.brla.onPixOutputTicket = undefined;
    world.brla.accountBalances = { BRLA: 1_000_000, USDC: 0, USDM: 0, USDT: 0 };
    world.squidRouter.bridgeStatus = "success";
    // The bridge leg swaps 6-decimal Base USDC into 6-decimal Arbitrum USDC;
    // the fake route must report matching decimals.
    world.squidRouter.toTokenDecimals = 6;
    // Deterministic Nabla quoter for BRLA (18 decimals) → USDC (6 decimals) at
    // a flat 5 BRLA per USDC, matching the FakePrices 5 BRL/USD feed.
    world.evm.onReadContract = (_network, params) => {
      if (params.functionName === "quoteSwapExactTokensForTokens") {
        const amountIn = params.args?.[0] as bigint;
        return amountIn / 5n / 10n ** 12n;
      }
      return undefined;
    };
  });

  async function createQuoteViaApi(
    destinationNetwork: EvmNetworks = Networks.Arbitrum
  ): Promise<{ id: string; networkFeeUsd: string; outputAmount: string }> {
    const response = await app.request("/v1/quotes", {
      body: JSON.stringify({
        from: "pix",
        inputAmount: "500",
        inputCurrency: FiatToken.BRL,
        network: destinationNetwork,
        outputCurrency: EvmToken.USDC,
        rampType: RampDirection.BUY,
        to: destinationNetwork
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(response.status, `quote creation failed: ${await response.clone().text()}`).toBe(201);
    return (await response.json()) as { id: string; networkFeeUsd: string; outputAmount: string };
  }

  async function registerViaApi(
    quoteId: string,
    userId: string,
    ephemeral: PrivateKeyAccount,
    destination: `0x${string}`
  ): Promise<{ id: string }> {
    const response = await app.request("/v1/ramp/register", {
      body: JSON.stringify({
        additionalData: { destinationAddress: destination, taxId: TAX_ID },
        quoteId,
        signingAccounts: [{ address: ephemeral.address, type: "EVM" }]
      }),
      headers: {
        Authorization: `Bearer ${testUserToken(userId)}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    expect(response.status, `registration failed: ${await response.clone().text()}`).toBe(201);
    return (await response.json()) as { id: string };
  }

  function blueprintOf(unsignedTxs: UnsignedTx[], phase: RampPhase): UnsignedTx {
    const blueprint = unsignedTxs.find(tx => tx.phase === phase);
    expect(blueprint, `missing ${phase} blueprint in persisted ramp state`).toBeDefined();
    return blueprint as UnsignedTx;
  }

  /**
   * Creates quote + registration through the HTTP API, signs every ephemeral
   * blueprint with the shared production signer (including backups), and
   * submits the result through the real /v1/ramp/update validation path.
   */
  async function setUpRegisteredRamp(): Promise<CorridorSetup> {
    const ephemeralSecret = generatePrivateKey();
    const ephemeral = privateKeyToAccount(ephemeralSecret);
    const destination = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;

    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });
    const quote = await createQuoteViaApi();
    expect(new Big(quote.networkFeeUsd).gt("2.5")).toBe(true);
    const ramp = await registerViaApi(quote.id, user.id, ephemeral, destination);

    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    if (!persistedQuote) {
      throw new Error("Quote not found after creation");
    }
    const nablaMetadata = getBlockMetadata(persistedQuote.metadata, NablaSwapContext);
    const squidMetadata = getBlockMetadata(persistedQuote.metadata, SquidRouterSwapContext);
    const swapInputRaw = BigInt(nablaMetadata.inputAmountForSwapRaw);
    const swapOutputRaw = BigInt(nablaMetadata.outputAmountRaw);
    const bridgedAmountRaw = BigInt(squidMetadata.outputAmountRaw);
    expect(swapInputRaw).toBeGreaterThan(0n);
    expect(swapOutputRaw).toBeGreaterThan(0n);
    expect(bridgedAmountRaw).toBeGreaterThan(0n);

    const rampState = await RampState.findByPk(ramp.id);
    if (!rampState) {
      throw new Error("Ramp state not found after registration");
    }
    const unsignedTxs = rampState.unsignedTxs ?? [];

    const nablaApproveBlueprint = blueprintOf(unsignedTxs, "nablaApprove");
    const nablaSwapBlueprint = blueprintOf(unsignedTxs, "nablaSwap");
    const squidApproveBlueprint = blueprintOf(unsignedTxs, "squidRouterApprove");
    const squidSwapBlueprint = blueprintOf(unsignedTxs, "squidRouterSwap");
    const transferBlueprint = blueprintOf(unsignedTxs, "destinationTransfer");
    expect(nablaApproveBlueprint.network).toBe(Networks.Base);
    expect(nablaSwapBlueprint.network).toBe(Networks.Base);
    expect(squidApproveBlueprint.network).toBe(Networks.Base);
    expect(squidSwapBlueprint.network).toBe(Networks.Base);
    expect(transferBlueprint.network).toBe(Networks.Arbitrum);

    const presignedTxs = await signUnsignedTransactions(unsignedTxs, {
      evmEphemeral: {
        address: ephemeral.address,
        secret: ephemeralSecret
      }
    });
    const signedFor = (phase: RampPhase) => {
      const transaction = presignedTxs.find(tx => tx.phase === phase);
      expect(transaction, `production signer omitted ${phase}`).toBeDefined();
      return transaction?.txData as `0x${string}`;
    };
    const signedNablaSwap = signedFor("nablaSwap");
    const signedSquidApprove = signedFor("squidRouterApprove");
    const signedSquidSwap = signedFor("squidRouterSwap");
    const signedTransfer = signedFor("destinationTransfer");

    const updateResponse = await app.request("/v1/ramp/update", {
      body: JSON.stringify({ presignedTxs, rampId: ramp.id }),
      headers: {
        Authorization: `Bearer ${testUserToken(user.id)}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    expect(updateResponse.status, `ramp update failed: ${await updateResponse.clone().text()}`).toBe(200);

    const transferTxData = transferBlueprint.txData as unknown as { data: `0x${string}` };
    const { args } = decodeFunctionData({ abi: erc20Abi, data: transferTxData.data });
    const amountRaw = (args as [string, bigint])[1];

    return {
      amountRaw,
      bridgedAmountRaw,
      destination,
      ephemeral,
      quoteId: quote.id,
      rampId: ramp.id,
      signedNablaSwap,
      signedSquidApprove,
      signedSquidSwap,
      signedTransfer,
      swapInputRaw,
      swapOutputRaw
    };
  }

  /**
   * Scripts the fake world so every polling loop succeeds on its first check:
   * - the Avenia subaccount holds the minted BRL and the mint ticket credits
   *   the ephemeral's BRLA on Base instantly,
   * - the ephemeral has source gas on Base but only a partial destination gas
   *   balance on Arbitrum, so fundEphemeral must supply the exact shortfall,
   * - the broadcast Nabla swap credits the ephemeral's Base USDC,
   * - the broadcast squid swap credits the bridged USDC on Arbitrum,
   * - the destination payout is accepted only if the funded native balance can
   *   cover its full signed fee cap, then raw ERC-20 transfers are applied to
   *   the in-memory ledger.
   */
  function scriptHappyWorld(setup: CorridorSetup): DestinationFundingExpectation {
    const parsedTransfer = parseTransaction(setup.signedTransfer);
    if (parsedTransfer.gas === undefined || parsedTransfer.maxFeePerGas === undefined) {
      throw new Error("Signed destination transfer is missing its gas fee cap");
    }
    const liabilityRaw = parsedTransfer.gas * parsedTransfer.maxFeePerGas;
    const initialBalanceRaw = liabilityRaw / 4n;
    const shortfallRaw = liabilityRaw - initialBalanceRaw;

    world.evm.setNativeBalance(Networks.Base, setup.ephemeral.address, parseUnits("2", 18));
    world.evm.setNativeBalance(Networks.Arbitrum, setup.ephemeral.address, initialBalanceRaw);
    world.brla.onPixOutputTicket = ({ walletAddress }) => {
      if (walletAddress) {
        // Generous credit (same as the direct corridor): the mint handler
        // polls for the full live-quote amount, which sits slightly above the
        // pre-computed swap input.
        world.evm.setErc20Balance(Networks.Base, BRLA_ON_BASE, walletAddress, parseUnits("1000000", 18));
      }
    };
    world.evm.onTransaction = tx => {
      if (!tx.serialized && tx.to?.toLowerCase() === setup.ephemeral.address.toLowerCase() && tx.value !== undefined) {
        world.evm.setNativeBalance(
          tx.network,
          setup.ephemeral.address,
          world.evm.nativeBalance(tx.network, setup.ephemeral.address) + tx.value
        );
        return;
      }
      if (tx.serialized === setup.signedNablaSwap) {
        world.evm.setErc20Balance(Networks.Base, USDC_ON_BASE, setup.ephemeral.address, setup.swapOutputRaw);
        return;
      }
      if (tx.serialized === setup.signedSquidSwap) {
        world.evm.setErc20Balance(
          Networks.Arbitrum,
          USDC_ON_ARBITRUM,
          setup.ephemeral.address,
          world.evm.erc20Balance(Networks.Arbitrum, USDC_ON_ARBITRUM, setup.ephemeral.address) + setup.bridgedAmountRaw
        );
        return;
      }
      if (tx.serialized === setup.signedTransfer) {
        const fundedBalanceRaw = world.evm.nativeBalance(Networks.Arbitrum, setup.ephemeral.address);
        if (fundedBalanceRaw < liabilityRaw) {
          throw new Error(
            `FakeEvm: destination payout needs ${liabilityRaw} native units but ephemeral holds ${fundedBalanceRaw}`
          );
        }
        // Charge the full signed fee cap. Real execution normally spends less, but
        // this proves the selected funding survives the worst case authorized by
        // the transaction before the fake RPC accepts the submission.
        world.evm.setNativeBalance(Networks.Arbitrum, setup.ephemeral.address, fundedBalanceRaw - liabilityRaw);
      }
      const parsed = tx.serialized ? parseTransaction(tx.serialized as `0x${string}`) : { data: tx.data, to: tx.to };
      if (!parsed.to || !parsed.data) {
        return;
      }
      let decoded: { functionName: string; args: readonly unknown[] };
      try {
        decoded = decodeFunctionData({ abi: erc20Abi, data: parsed.data as `0x${string}` });
      } catch {
        return;
      }
      if (decoded.functionName !== "transfer") {
        return;
      }
      const [recipient, amount] = decoded.args as [`0x${string}`, bigint];
      world.evm.setErc20Balance(
        tx.network,
        parsed.to,
        recipient,
        world.evm.erc20Balance(tx.network, parsed.to, recipient) + amount
      );
    };

    return { initialBalanceRaw, liabilityRaw, shortfallRaw };
  }

  function submissionsOf(signedTx: `0x${string}`): number {
    return world.evm.sentTransactions.filter(tx => tx.serialized === signedTx).length;
  }

  it("prices destination execution for ETH, MATIC, BNB, and AVAX gas chains", async () => {
    for (const network of [
      Networks.Ethereum,
      Networks.Arbitrum,
      Networks.Polygon,
      Networks.BSC,
      Networks.Avalanche
    ] as const) {
      const quote = await createQuoteViaApi(network);
      const persistedQuote = await QuoteTicket.findByPk(quote.id);

      expect(persistedQuote?.network).toBe(network);
      expect(persistedQuote?.to).toBe(network);
      expect(new Big(quote.networkFeeUsd).gt("2.5")).toBe(true);
      expect(getFlowMetadata(persistedQuote?.metadata).globals.evmDestinationGas?.network).toBe(network);
    }
  });

  it(
    "dynamically funds the signed payout shortfall, then submits the full cross-chain payout",
    async () => {
      const setup = await setUpRegisteredRamp();
      const destinationFunding = scriptHappyWorld(setup);
      const pixOutBefore = world.brla.pixOutputTickets.length;

      // Registration requested a Base USDC → Arbitrum USDC squid route.
      const registrationRoute = world.squidRouter.requestedRoutes.find(
        route =>
          route.fromToken.toLowerCase() === USDC_ON_BASE.toLowerCase() &&
          route.toToken.toLowerCase() === USDC_ON_ARBITRUM.toLowerCase() &&
          route.fromChain === "8453" &&
          route.toChain === "42161"
      );
      expect(registrationRoute, "registration should request a Base→Arbitrum USDC route").toBeDefined();

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(final?.state.squidRouterApproveHash).toBeTruthy();
      expect(final?.state.squidRouterSwapHash).toBeTruthy();

      const quote = await QuoteTicket.findByPk(setup.quoteId);
      expect(quote?.status).toBe("consumed");

      // The full Avenia mint flow ran, the Nabla swap and both squid legs each
      // hit Base exactly once, and the destination received exactly the quoted
      // USDC on Arbitrum.
      expect(world.brla.pixOutputTickets.length).toBe(pixOutBefore + 1);
      expect(submissionsOf(setup.signedNablaSwap)).toBe(1);
      expect(submissionsOf(setup.signedSquidApprove)).toBe(1);
      expect(submissionsOf(setup.signedSquidSwap)).toBe(1);
      expect(submissionsOf(setup.signedTransfer)).toBe(1);
      const destinationFundingTxs = world.evm.sentTransactions.filter(
        tx =>
          !tx.serialized &&
          tx.network === Networks.Arbitrum &&
          tx.to?.toLowerCase() === setup.ephemeral.address.toLowerCase() &&
          tx.value !== undefined
      );
      expect(destinationFundingTxs).toHaveLength(1);
      expect(destinationFundingTxs[0].value).toBe(destinationFunding.shortfallRaw);
      expect(destinationFundingTxs[0].gas).toBe(21_000n);
      expect(destinationFundingTxs[0].maxFeePerGas).toBe(1_000_000_000n);
      expect(destinationFundingTxs[0].maxPriorityFeePerGas).toBe(1_000_000_000n);
      expect(destinationFunding.initialBalanceRaw + (destinationFundingTxs[0].value ?? 0n)).toBe(
        destinationFunding.liabilityRaw
      );
      expect(world.evm.nativeBalance(Networks.Arbitrum, setup.ephemeral.address)).toBe(0n);
      expect(world.evm.erc20Balance(Networks.Arbitrum, USDC_ON_ARBITRUM, setup.destination)).toBe(setup.amountRaw);
    },
    30000
  );

  it(
    "pauses without treasury spend when live destination fees exceed the quote envelope",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      world.evm.setFeeEstimate(Networks.Arbitrum, 1_200_000_001n, 1_000_000_000n);

      await phaseProcessor.processRamp(setup.rampId);

      const paused = await RampState.findByPk(setup.rampId);
      expect(paused?.currentPhase).toBe("fundEphemeral");
      expect(
        world.evm.sentTransactions.filter(
          tx =>
            !tx.serialized &&
            tx.network === Networks.Arbitrum &&
            tx.to?.toLowerCase() === setup.ephemeral.address.toLowerCase()
        )
      ).toHaveLength(0);
      expect(submissionsOf(setup.signedTransfer)).toBe(0);
      expect(paused?.errorLogs.some(log => log.phase === "fundEphemeral" && log.recoverable)).toBe(true);
    },
    30000
  );
});
