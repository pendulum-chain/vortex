import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  EvmToken,
  evmTokenConfig,
  FiatToken,
  Networks,
  RampDirection,
  type RampPhase,
  type UnsignedTx
} from "@vortexfi/shared";
import { decodeFunctionData, erc20Abi, parseTransaction, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import phaseProcessor from "../../api/services/phases/phase-processor";
import Partner from "../../models/partner.model";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestTaxId, createTestUser } from "../../test-utils/factories";
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

const CHAIN_IDS: Partial<Record<Networks, number>> = {
  [Networks.Arbitrum]: 42161,
  [Networks.Base]: 8453
};

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
    // The EVM fee distribution transaction builder requires the vortex
    // partner's EVM payout address even when the resulting fees are zero.
    await Partner.update(
      { payoutAddressEvm: "0x000000000000000000000000000000000000fee5" },
      { where: { name: "vortex", rampType: RampDirection.BUY } }
    );
    world.evm.failNextSends = 0;
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

  async function createQuoteViaApi(): Promise<{ id: string; outputAmount: string }> {
    const response = await app.request("/v1/quotes", {
      body: JSON.stringify({
        from: "pix",
        inputAmount: "500",
        inputCurrency: FiatToken.BRL,
        network: Networks.Arbitrum,
        outputCurrency: EvmToken.USDC,
        rampType: RampDirection.BUY,
        to: Networks.Arbitrum
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(response.status, `quote creation failed: ${await response.clone().text()}`).toBe(201);
    return (await response.json()) as { id: string; outputAmount: string };
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

  async function signBlueprint(ephemeral: PrivateKeyAccount, blueprint: UnsignedTx): Promise<`0x${string}`> {
    const txData = blueprint.txData as unknown as { to: `0x${string}`; data: `0x${string}`; value?: string };
    const chainId = CHAIN_IDS[blueprint.network];
    if (!chainId) {
      throw new Error(`No chain id mapped for ${blueprint.network}`);
    }
    return ephemeral.signTransaction({
      chainId,
      data: txData.data,
      gas: 600_000n,
      maxFeePerGas: 5_000_000_000n,
      maxPriorityFeePerGas: 5_000_000_000n,
      nonce: blueprint.nonce,
      to: txData.to,
      type: "eip1559",
      value: BigInt(txData.value ?? "0")
    });
  }

  /**
   * Creates quote + registration through the HTTP API, then signs the
   * ephemeral phase blueprints exactly as issued — the Nabla pair and squid
   * pair on Base plus the destination transfer on Arbitrum — and stores them
   * as presigned transactions the way /v1/ramp/update would.
   */
  async function setUpRegisteredRamp(): Promise<CorridorSetup> {
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const destination = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;

    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });
    const quote = await createQuoteViaApi();
    const ramp = await registerViaApi(quote.id, user.id, ephemeral, destination);

    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    const swapInputRaw = BigInt(persistedQuote?.metadata.nablaSwapEvm?.inputAmountForSwapRaw ?? "0");
    const swapOutputRaw = BigInt(persistedQuote?.metadata.nablaSwapEvm?.outputAmountRaw ?? "0");
    const bridgedAmountRaw = BigInt(persistedQuote?.metadata.evmToEvm?.outputAmountRaw ?? "0");
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
    expect(squidApproveBlueprint.network).toBe(Networks.Base);
    expect(squidSwapBlueprint.network).toBe(Networks.Base);
    expect(transferBlueprint.network).toBe(Networks.Arbitrum);

    const signedNablaApprove = await signBlueprint(ephemeral, nablaApproveBlueprint);
    const signedNablaSwap = await signBlueprint(ephemeral, nablaSwapBlueprint);
    const signedSquidApprove = await signBlueprint(ephemeral, squidApproveBlueprint);
    const signedSquidSwap = await signBlueprint(ephemeral, squidSwapBlueprint);
    const signedTransfer = await signBlueprint(ephemeral, transferBlueprint);

    const presign = (blueprint: UnsignedTx, txData: `0x${string}`) => ({
      meta: {},
      network: blueprint.network,
      nonce: blueprint.nonce,
      phase: blueprint.phase,
      signer: ephemeral.address,
      txData
    });

    await rampState.update({
      presignedTxs: [
        presign(nablaApproveBlueprint, signedNablaApprove),
        presign(nablaSwapBlueprint, signedNablaSwap),
        presign(squidApproveBlueprint, signedSquidApprove),
        presign(squidSwapBlueprint, signedSquidSwap),
        presign(transferBlueprint, signedTransfer)
      ]
    });

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
   * - the ephemeral has gas on Base AND Arbitrum (destination funding),
   * - the broadcast Nabla swap credits the ephemeral's Base USDC,
   * - the broadcast squid swap credits the bridged USDC on Arbitrum,
   * - raw ERC-20 transfers are applied to the in-memory ledger.
   */
  function scriptHappyWorld(setup: CorridorSetup): void {
    world.evm.setNativeBalance(Networks.Base, setup.ephemeral.address, parseUnits("2", 18));
    world.evm.setNativeBalance(Networks.Arbitrum, setup.ephemeral.address, parseUnits("2", 18));
    world.brla.onPixOutputTicket = ({ walletAddress }) => {
      if (walletAddress) {
        // Generous credit (same as the direct corridor): the mint handler
        // polls for the full live-quote amount, which sits slightly above the
        // pre-computed swap input.
        world.evm.setErc20Balance(Networks.Base, BRLA_ON_BASE, walletAddress, parseUnits("1000000", 18));
      }
    };
    world.evm.onTransaction = tx => {
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
  }

  function submissionsOf(signedTx: `0x${string}`): number {
    return world.evm.sentTransactions.filter(tx => tx.serialized === signedTx).length;
  }

  it(
    "happy path: mints on Base, swaps BRLA to USDC via Nabla, bridges via squid, and pays the destination on Arbitrum",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
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
      expect(world.evm.erc20Balance(Networks.Arbitrum, USDC_ON_ARBITRUM, setup.destination)).toBe(setup.amountRaw);
    },
    30000
  );
});
