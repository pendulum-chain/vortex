import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
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
import { Signature as EvmSignature } from "ethers";
import { decodeFunctionData, erc20Abi, parseTransaction, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { getOrCreateCustomerEntityForProfile, selectActiveCustomerEntity } from "../../api/services/customer-entity.service";
import { getBlockMetadata } from "../../api/services/phases/blocks/core/metadata";
import { MoneriumIssueContext, MONERIUM_ISSUE_NETWORKS } from "../../api/services/phases/blocks/phases/monerium-issue/simulation";
import { moneriumPermitAbi } from "../../api/services/phases/blocks/phases/monerium-self-transfer/contract";
import { SquidRouterSwapContext } from "../../api/services/phases/blocks/phases/squid-router-swap/simulation";
import {
  POLYGON_EURE,
  POLYGON_EURE_USDC_ROUTE,
  POLYGON_UNISWAP_V3_FACTORY,
  POLYGON_UNISWAP_V3_ROUTER,
  POLYGON_USDC
} from "../../api/services/phases/blocks/phases/uniswap-v3-fixed-swap/contract";
import { UniswapV3FixedSwapContext } from "../../api/services/phases/blocks/phases/uniswap-v3-fixed-swap/simulation";
import phaseProcessor from "../../api/services/phases/phase-processor";
import { config } from "../../config/vars";
import FinancialOperation from "../../models/financialOperation.model";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestUser, updatePartnerPricing } from "../../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../../test-utils/test-app";

function requireToken(network: Networks.Arbitrum, token: EvmToken) {
  const details = evmTokenConfig[network][token];
  if (!details) throw new Error(`${token} token config missing for ${network}`);
  return details;
}
const USDC_ON_ARBITRUM = requireToken(Networks.Arbitrum, EvmToken.USDC).erc20AddressSourceChain as `0x${string}`;
const EURE_ON_POLYGON = MONERIUM_ISSUE_NETWORKS[Networks.Polygon].eureAddress;

const PROFILE_ID = "9e6a92a5-5f6d-48aa-a57b-0f8ae8eb745d";
const CHAIN_ID_HEX: Record<string, string> = { arbitrum: "0xa4b1", polygon: "0x89" };
/** Fake Uniswap quoter: 1 EURe (18 decimals) buys 1.16 USDC (6 decimals). */
const EURE_USDC_RATE_MICRO = 1_160_000n;

function installChainIdShim(): { restore: () => void } {
  const guardedFetch = globalThis.fetch;
  const shim = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (typeof init?.body === "string") {
      try {
        const payload = JSON.parse(init.body) as { id?: number; method?: string };
        if (payload.method === "eth_chainId") {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          const chainId = Object.entries(CHAIN_ID_HEX).find(([name]) => url.includes(name))?.[1] ?? CHAIN_ID_HEX.arbitrum;
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

const HAPPY_PATH_PHASES: RampPhase[] = [
  "initial",
  "moneriumOnrampMint",
  "fundEphemeral",
  "moneriumOnrampSelfTransfer",
  "uniswapApprove",
  "uniswapSwap",
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
  userId: string;
  owner: PrivateKeyAccount;
  ephemeral: PrivateKeyAccount;
  destination: `0x${string}`;
  /** Raw (18-decimal) EURe the mint must credit the owner with (input minus issue fee). */
  issuedRaw: bigint;
  /** Raw (6-decimal) USDC the fixed Uniswap swap yields on Polygon. */
  swapOutputRaw: bigint;
  /** Raw (6-decimal) USDC the squid bridge delivers on Arbitrum. */
  bridgedAmountRaw: bigint;
  /** Raw (6-decimal) USDC the presigned destination transfer pays out. */
  amountRaw: bigint;
  signedTransferFrom: `0x${string}`;
  signedUniswapApprove: `0x${string}`;
  signedUniswapSwap: `0x${string}`;
  signedSquidSwap: `0x${string}`;
  signedTransfer: `0x${string}`;
  ibanPaymentData: { bic: string; iban: string; receiverName: string; reference: string };
}

/**
 * Corridor scenario tests for the production EUR onramp (SEPA → EURe minted to
 * the Monerium-linked owner on Polygon → owner permit + ephemeral transferFrom
 * → fixed Uniswap V3 EURe/USDC swap → fees and subsidy → SquidRouter bridge →
 * USDC on Arbitrum). Quote, registration, and presign submission go through
 * the real HTTP API; the REAL PhaseProcessor drives every phase against the
 * fake external world. This is the hermetic coverage the removed EUR
 * kill-switch required.
 */
describe("EUR onramp Monerium corridor (sepa → Polygon mint+swap → USDC on Arbitrum)", () => {
  let world: FakeWorld;
  let auth: { restore: () => void };
  let chainIdShim: { restore: () => void };
  let app: TestApp;
  const originalIssueFee = config.monerium.issueFeeEur;

  beforeAll(async () => {
    world = installFakeWorld();
    chainIdShim = installChainIdShim();
    auth = installFakeSupabaseAuth();
    await setupTestDatabase();
    app = await startTestApp();
    config.monerium.issueFeeEur = "1";
  });

  afterAll(async () => {
    config.monerium.issueFeeEur = originalIssueFee;
    await app?.close();
    auth?.restore();
    chainIdShim?.restore();
    world?.restore();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    await updatePartnerPricing("vortex", RampDirection.BUY, { payoutAddressEvm: "0x000000000000000000000000000000000000fee5" });
    world.evm.failNextSends = 0;
    world.evm.setFeeEstimate(Networks.Arbitrum, 1_000_000_000n);
    world.evm.setFeeEstimate(Networks.Polygon, 1_000_000_000n);
    world.evm.onTransaction = undefined;
    world.evm.contractAddresses.clear();
    world.evm.strictReceipts = true;
    world.monerium.profiles.clear();
    world.monerium.addresses.length = 0;
    world.monerium.ibans.length = 0;
    world.squidRouter.bridgeStatus = "success";
    world.squidRouter.computeToAmount = params => params.fromAmount;
    world.squidRouter.computeToAmountMin = params => world.squidRouter.computeToAmount(params);
    world.squidRouter.computeToAmountUsd = params => new Big(params.fromAmount).div(1_000_000).toFixed();
    world.squidRouter.toTokenDecimals = 6;
    // The pinned Polygon EURe -> USDC.e -> USDC deployment verifies against these constants;
    // per-ramp allowance and nonce reads are layered on top by scriptHappyWorld.
    const sameAddress = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
    world.evm.onReadContract = (_network, params) => {
      const hop = POLYGON_EURE_USDC_ROUTE.find(candidate => sameAddress(params.address, candidate.pool));
      switch (params.functionName) {
        case "token0":
          return hop?.tokenIn;
        case "token1":
          return hop?.tokenOut;
        case "fee":
          return hop?.fee;
        case "factory":
          return POLYGON_UNISWAP_V3_FACTORY;
        case "getPool": {
          const [tokenIn, tokenOut, fee] = params.args ?? [];
          return POLYGON_EURE_USDC_ROUTE.find(
            candidate => candidate.fee === fee && sameAddress(tokenIn, candidate.tokenIn) && sameAddress(tokenOut, candidate.tokenOut)
          )?.pool;
        }
        default:
          return undefined;
      }
    };
    world.evm.onSimulateContract = (_network, params) => {
      if (params.functionName === "quoteExactInput") {
        const amountIn = params.args?.[1] as bigint;
        return (amountIn * EURE_USDC_RATE_MICRO) / 10n ** 18n;
      }
      return undefined;
    };
  });

  async function createQuoteViaApi(): Promise<{ id: string; outputAmount: string }> {
    const response = await app.request("/v1/quotes", {
      body: JSON.stringify({
        from: "sepa",
        inputAmount: "100",
        inputCurrency: FiatToken.EURC,
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

  /** A Vortex user bound to an approved Monerium profile whose Polygon IBAN points at `owner`. */
  async function bindMoneriumUser(owner: PrivateKeyAccount): Promise<string> {
    const user = await createTestUser();
    const entity = await getOrCreateCustomerEntityForProfile(user.id);
    await ProviderCustomer.create({
      customerEntityId: entity.id,
      customerType: entity.type,
      provider: "monerium",
      providerCustomerId: PROFILE_ID,
      rail: "eur",
      status: VerificationStatus.Approved,
      statusExternal: "approved"
    });
    world.monerium.provisionApprovedProfile(PROFILE_ID, owner.address, "polygon");
    return user.id;
  }

  async function registerViaApi(
    quoteId: string,
    userId: string,
    ephemeral: PrivateKeyAccount,
    owner: PrivateKeyAccount,
    destination: `0x${string}`,
    customerType?: "individual" | "business"
  ): Promise<Response> {
    return app.request("/v1/ramp/register", {
      body: JSON.stringify({
        additionalData: { ...(customerType ? { customerType } : {}), destinationAddress: destination, walletAddress: owner.address },
        quoteId,
        signingAccounts: [{ address: ephemeral.address, type: "EVM" }]
      }),
      headers: { Authorization: `Bearer ${testUserToken(userId)}`, "Content-Type": "application/json" },
      method: "POST"
    });
  }

  function blueprintOf(unsignedTxs: UnsignedTx[], phase: RampPhase, signer?: string): UnsignedTx {
    const blueprint = unsignedTxs.find(
      tx => tx.phase === phase && (!signer || tx.signer.toLowerCase() === signer.toLowerCase())
    );
    expect(blueprint, `missing ${phase} blueprint in persisted ramp state`).toBeDefined();
    return blueprint as UnsignedTx;
  }

  /** Signs the owner's EIP-712 permit the way the SDK/widget do (attachSignatures). */
  async function signOwnerPermit(blueprint: UnsignedTx, owner: PrivateKeyAccount): Promise<PresignedTx> {
    const unsigned = blueprint.txData as SignedTypedData;
    const hex = await owner.signTypedData({
      domain: unsigned.domain,
      message: unsigned.message,
      primaryType: unsigned.primaryType,
      types: unsigned.types
    } as Parameters<PrivateKeyAccount["signTypedData"]>[0]);
    const { r, s, v } = EvmSignature.from(hex);
    return {
      ...blueprint,
      txData: [{ ...unsigned, signature: { deadline: Number(unsigned.message.deadline), r: r as `0x${string}`, s: s as `0x${string}`, v } }]
    } as PresignedTx;
  }

  /**
   * Quote + registration through the HTTP API, then the ephemeral blueprints are
   * signed with the shared production signer and the owner permit with the owner
   * key, and the full set goes through the real /v1/ramp/update path.
   */
  async function setUpRegisteredRamp(): Promise<CorridorSetup> {
    const ephemeralSecret = generatePrivateKey();
    const ephemeral = privateKeyToAccount(ephemeralSecret);
    const owner = privateKeyToAccount(generatePrivateKey());
    const destination = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;
    const userId = await bindMoneriumUser(owner);
    // The owner already holds some EURe; the mint is attributed by balance delta.
    world.evm.setErc20Balance(Networks.Polygon, EURE_ON_POLYGON, owner.address, parseUnits("5", 18));

    const quote = await createQuoteViaApi();
    const registerResponse = await registerViaApi(quote.id, userId, ephemeral, owner, destination);
    expect(registerResponse.status, `registration failed: ${await registerResponse.clone().text()}`).toBe(201);
    const registered = (await registerResponse.json()) as { id: string; ibanPaymentData?: unknown };
    // Payment instructions stay hidden until every signature (owner permit included) validates.
    expect(registered.ibanPaymentData).toBeUndefined();

    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    if (!persistedQuote) throw new Error("Quote not found after creation");
    const issue = getBlockMetadata(persistedQuote.metadata, MoneriumIssueContext);
    const uniswap = getBlockMetadata(persistedQuote.metadata, UniswapV3FixedSwapContext);
    const squid = getBlockMetadata(persistedQuote.metadata, SquidRouterSwapContext);
    const issuedRaw = BigInt(issue.issue.outputAmountRaw);
    const swapOutputRaw = BigInt(uniswap.outputAmountRaw);
    const bridgedAmountRaw = BigInt(squid.outputAmountRaw);
    expect(issuedRaw).toBe(parseUnits("99", 18));
    expect(swapOutputRaw).toBeGreaterThan(0n);
    expect(bridgedAmountRaw).toBeGreaterThan(0n);

    const rampState = await RampState.findByPk(registered.id);
    if (!rampState) throw new Error("Ramp state not found after registration");
    const unsignedTxs = rampState.unsignedTxs ?? [];
    const permitBlueprint = blueprintOf(unsignedTxs, "moneriumOnrampSelfTransfer", owner.address);
    const transferFromBlueprint = blueprintOf(unsignedTxs, "moneriumOnrampSelfTransfer", ephemeral.address);
    const transferBlueprint = blueprintOf(unsignedTxs, "destinationTransfer");
    expect(permitBlueprint.network).toBe(Networks.Polygon);
    expect(transferFromBlueprint.network).toBe(Networks.Polygon);
    expect(blueprintOf(unsignedTxs, "uniswapSwap").network).toBe(Networks.Polygon);
    expect(transferBlueprint.network).toBe(Networks.Arbitrum);

    // Like the SDK, the shared signer only receives the ephemeral-owned blueprints.
    const ephemeralPresigned = await signUnsignedTransactions(
      unsignedTxs.filter(tx => tx.signer.toLowerCase() === ephemeral.address.toLowerCase()),
      { evmEphemeral: { address: ephemeral.address, secret: ephemeralSecret } }
    );
    const presignedTxs = [...ephemeralPresigned, await signOwnerPermit(permitBlueprint, owner)];
    const signedFor = (phase: RampPhase) => {
      const transaction = ephemeralPresigned.find(tx => tx.phase === phase);
      expect(transaction, `production signer omitted ${phase}`).toBeDefined();
      return transaction?.txData as `0x${string}`;
    };

    const updateResponse = await app.request("/v1/ramp/update", {
      body: JSON.stringify({ presignedTxs, rampId: registered.id }),
      headers: { Authorization: `Bearer ${testUserToken(userId)}`, "Content-Type": "application/json" },
      method: "POST"
    });
    expect(updateResponse.status, `ramp update failed: ${await updateResponse.clone().text()}`).toBe(200);
    const updated = (await updateResponse.json()) as { ibanPaymentData?: CorridorSetup["ibanPaymentData"] };
    if (!updated.ibanPaymentData) throw new Error("ibanPaymentData was not released after the complete presign");

    const transferTxData = transferBlueprint.txData as unknown as { data: `0x${string}` };
    const { args } = decodeFunctionData({ abi: erc20Abi, data: transferTxData.data });

    return {
      amountRaw: (args as [string, bigint])[1],
      bridgedAmountRaw,
      destination,
      ephemeral,
      ibanPaymentData: updated.ibanPaymentData,
      issuedRaw,
      owner,
      quoteId: quote.id,
      rampId: registered.id,
      signedSquidSwap: signedFor("squidRouterSwap"),
      signedTransfer: signedFor("destinationTransfer"),
      signedTransferFrom: signedFor("moneriumOnrampSelfTransfer"),
      signedUniswapApprove: signedFor("uniswapApprove"),
      signedUniswapSwap: signedFor("uniswapSwap"),
      swapOutputRaw,
      userId
    };
  }

  /**
   * Scripts the fake world so every phase succeeds on its first check:
   * - Monerium has minted the issued EURe to the owner (balance delta),
   * - the owner's ERC-2612 nonce and allowance follow the permit and transferFrom,
   * - the ephemeral's router allowance follows the Uniswap approve and swap, which
   *   converts EURe into Polygon USDC at the quoted rate,
   * - the bridge credits Arbitrum USDC, and every raw ERC-20 transfer is applied
   *   to the ledger so fees, subsidy, and the final payout land.
   */
  function scriptHappyWorld(setup: CorridorSetup): { consumeOwnerNonce: () => void; permitCalls: () => number } {
    const owner = setup.owner.address.toLowerCase();
    const ephemeral = setup.ephemeral.address.toLowerCase();
    let ownerNonce = 0n;
    let permitAllowance = 0n;
    let routerAllowance = 0n;
    let permitCalls = 0;
    const verifyDeployment = world.evm.onReadContract;

    world.evm.setErc20Balance(
      Networks.Polygon,
      EURE_ON_POLYGON,
      setup.owner.address,
      world.evm.erc20Balance(Networks.Polygon, EURE_ON_POLYGON, setup.owner.address) + setup.issuedRaw
    );
    world.evm.setNativeBalance(Networks.Arbitrum, setup.ephemeral.address, 0n);

    world.evm.onReadContract = (network, params) => {
      if (params.address.toLowerCase() === EURE_ON_POLYGON.toLowerCase()) {
        const [first, second] = (params.args ?? []) as string[];
        if (params.functionName === "nonces" && first?.toLowerCase() === owner) return ownerNonce;
        if (params.functionName === "allowance" && first?.toLowerCase() === owner && second?.toLowerCase() === ephemeral) {
          return permitAllowance;
        }
        if (
          params.functionName === "allowance" &&
          first?.toLowerCase() === ephemeral &&
          second?.toLowerCase() === POLYGON_UNISWAP_V3_ROUTER.toLowerCase()
        ) {
          return routerAllowance;
        }
      }
      return verifyDeployment?.(network, params);
    };

    world.evm.onTransaction = tx => {
      // Treasury funding of the ephemeral's gas on either chain.
      if (!tx.serialized && tx.to?.toLowerCase() === ephemeral && tx.value !== undefined && !tx.data) {
        world.evm.setNativeBalance(tx.network, setup.ephemeral.address, world.evm.nativeBalance(tx.network, setup.ephemeral.address) + tx.value);
        return;
      }
      // The treasury-relayed owner permit consumes the owner's nonce and sets the exact allowance.
      if (!tx.serialized && tx.to?.toLowerCase() === EURE_ON_POLYGON.toLowerCase() && tx.data) {
        const decoded = decodeFunctionData({ abi: moneriumPermitAbi, data: tx.data as `0x${string}` });
        const [, spender, value] = decoded.args as readonly [string, string, bigint, bigint, number, string, string];
        expect(spender.toLowerCase()).toBe(ephemeral);
        permitCalls += 1;
        ownerNonce += 1n;
        permitAllowance = value;
        return;
      }
      if (tx.serialized === setup.signedTransferFrom) {
        world.evm.setErc20Balance(
          Networks.Polygon,
          EURE_ON_POLYGON,
          setup.owner.address,
          world.evm.erc20Balance(Networks.Polygon, EURE_ON_POLYGON, setup.owner.address) - setup.issuedRaw
        );
        world.evm.setErc20Balance(Networks.Polygon, EURE_ON_POLYGON, setup.ephemeral.address, setup.issuedRaw);
        permitAllowance -= setup.issuedRaw;
        return;
      }
      if (tx.serialized === setup.signedUniswapApprove) {
        routerAllowance = setup.issuedRaw;
        return;
      }
      if (tx.serialized === setup.signedUniswapSwap) {
        world.evm.setErc20Balance(Networks.Polygon, EURE_ON_POLYGON, setup.ephemeral.address, 0n);
        world.evm.setErc20Balance(Networks.Polygon, POLYGON_USDC, setup.ephemeral.address, setup.swapOutputRaw);
        routerAllowance = 0n;
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
      if (!parsed.to || !parsed.data) return;
      let decoded: { functionName: string; args: readonly unknown[] };
      try {
        decoded = decodeFunctionData({ abi: erc20Abi, data: parsed.data as `0x${string}` });
      } catch {
        return;
      }
      if (decoded.functionName !== "transfer") return;
      const [recipient, amount] = decoded.args as [`0x${string}`, bigint];
      world.evm.setErc20Balance(tx.network, parsed.to, recipient, world.evm.erc20Balance(tx.network, parsed.to, recipient) + amount);
    };

    return {
      consumeOwnerNonce: () => {
        ownerNonce += 1n;
      },
      permitCalls: () => permitCalls
    };
  }

  function submissionsOf(signedTx: `0x${string}`): number {
    return world.evm.sentTransactions.filter(tx => tx.serialized === signedTx).length;
  }

  it(
    "mints to the owner, pulls the exact permit amount, swaps, bridges, and pays out on Arbitrum",
    async () => {
      const setup = await setUpRegisteredRamp();
      const script = scriptHappyWorld(setup);

      expect(setup.ibanPaymentData).toMatchObject({ bic: "DEUTDEFF", iban: "DE89370400440532013000", receiverName: "Monerium EMI" });
      expect(setup.ibanPaymentData.reference).toMatch(/^VTX[0-9A-F]{32}$/);
      const registrationRoute = world.squidRouter.requestedRoutes.find(
        route =>
          route.fromToken.toLowerCase() === POLYGON_USDC.toLowerCase() &&
          route.toToken.toLowerCase() === USDC_ON_ARBITRUM.toLowerCase() &&
          route.fromChain === "137" &&
          route.toChain === "42161"
      );
      expect(registrationRoute, "registration should request a Polygon→Arbitrum USDC route").toBeDefined();

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.errorLogs).toEqual([]);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect((await QuoteTicket.findByPk(setup.quoteId))?.status).toBe("consumed");

      // One relayed permit, one transferFrom, one approve+swap, one bridge, one payout.
      expect(script.permitCalls()).toBe(1);
      expect(submissionsOf(setup.signedTransferFrom)).toBe(1);
      expect(submissionsOf(setup.signedUniswapApprove)).toBe(1);
      expect(submissionsOf(setup.signedUniswapSwap)).toBe(1);
      expect(submissionsOf(setup.signedSquidSwap)).toBe(1);
      expect(submissionsOf(setup.signedTransfer)).toBe(1);
      // Only the quoted post-fee amount left the owner; the pre-existing balance stays.
      expect(world.evm.erc20Balance(Networks.Polygon, EURE_ON_POLYGON, setup.owner.address)).toBe(parseUnits("5", 18));
      expect(world.evm.erc20Balance(Networks.Arbitrum, USDC_ON_ARBITRUM, setup.destination)).toBe(setup.amountRaw);
      const selfTransfer = final?.state.blockState?.moneriumSelfTransfer as { permitTxHash?: string; transferTxHash?: string };
      expect(selfTransfer.permitTxHash).toBeTruthy();
      expect(selfTransfer.transferTxHash).toBeTruthy();
    },
    30000
  );

  it(
    "pauses for reconciliation when the owner spent the permit nonce elsewhere, moving no funds",
    async () => {
      const setup = await setUpRegisteredRamp();
      const script = scriptHappyWorld(setup);
      // The owner signed another permit after registration, so the ramp's permit is stale.
      script.consumeOwnerNonce();

      await phaseProcessor.processRamp(setup.rampId);

      const paused = await RampState.findByPk(setup.rampId);
      expect(paused?.currentPhase).toBe("moneriumOnrampSelfTransfer");
      expect(paused?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(paused?.errorLogs.at(-1)?.error).toContain("nonce-consumed");
      expect(paused?.errorLogs.at(-1)?.recoverable).toBe(true);
      expect(script.permitCalls()).toBe(0);
      expect(submissionsOf(setup.signedTransferFrom)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Polygon, EURE_ON_POLYGON, setup.owner.address)).toBe(
        parseUnits("5", 18) + setup.issuedRaw
      );
    },
    30000
  );

  it("refuses registration when the linked wallet is a contract or the profile is unbound", async () => {
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const owner = privateKeyToAccount(generatePrivateKey());
    const destination = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;

    const unboundUser = await createTestUser();
    const unbound = await registerViaApi((await createQuoteViaApi()).id, unboundUser.id, ephemeral, owner, destination);
    expect(unbound.status).toBe(403);
    expect(await unbound.json()).toMatchObject({ type: "MONERIUM_ONBOARDING_REQUIRED" });

    const userId = await bindMoneriumUser(owner);
    world.evm.contractAddresses.add(owner.address.toLowerCase());
    const quote = await createQuoteViaApi();
    const contractWallet = await registerViaApi(quote.id, userId, ephemeral, owner, destination);
    expect(contractWallet.status).toBe(400);
    expect((await QuoteTicket.findByPk(quote.id))?.status).toBe("pending");
    expect(await FinancialOperation.count()).toBe(0);
  });

  it("registers the individual profile even when a different approved business profile is active", async () => {
    const user = await createTestUser();
    const individual = await getOrCreateCustomerEntityForProfile(user.id, "individual");
    const business = await selectActiveCustomerEntity(user.id, "business");
    const individualOwner = privateKeyToAccount(generatePrivateKey());
    const businessOwner = privateKeyToAccount(generatePrivateKey());
    const businessProfileId = "3e26276e-330e-4058-a81c-5b543cd8f78e";
    for (const [entity, profileId] of [[individual, PROFILE_ID], [business, businessProfileId]] as const) {
      await ProviderCustomer.create({
        customerEntityId: entity.id,
        customerType: entity.type,
        provider: "monerium",
        providerCustomerId: profileId,
        rail: "eur",
        status: VerificationStatus.Approved,
        statusExternal: "approved"
      });
    }
    world.monerium.provisionApprovedProfile(PROFILE_ID, individualOwner.address, "polygon");
    world.monerium.provisionApprovedProfile(businessProfileId, businessOwner.address, "polygon", "DE12500105170648489890");
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const destination = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;

    const omitted = await registerViaApi((await createQuoteViaApi()).id, user.id, ephemeral, individualOwner, destination);
    expect(omitted.status).toBe(409);
    expect(await omitted.json()).toMatchObject({ type: "MONERIUM_CUSTOMER_TYPE_REQUIRED" });

    const response = await registerViaApi((await createQuoteViaApi()).id, user.id, ephemeral, individualOwner, destination, "individual");
    expect(response.status, await response.clone().text()).toBe(201);
    const registered = (await response.json()) as { id: string };
    const ramp = await RampState.findByPk(registered.id);
    const issue = ramp?.state.blockState?.moneriumIssue as { moneriumProfileId?: string; owner?: string } | undefined;
    expect(issue?.moneriumProfileId).toBe(PROFILE_ID);
    expect(issue?.owner?.toLowerCase()).toBe(individualOwner.address.toLowerCase());
  });
});
