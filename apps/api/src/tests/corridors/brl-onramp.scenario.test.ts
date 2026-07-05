import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { EvmToken, evmTokenConfig, FiatToken, Networks, RampDirection, type RampPhase } from "@vortexfi/shared";
import { decodeFunctionData, encodeFunctionData, erc20Abi, parseTransaction, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import phaseProcessor from "../../api/services/phases/phase-processor";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import Subsidy from "../../models/subsidy.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestTaxId, createTestUser } from "../../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../../test-utils/test-app";

function requireBrlaOnBase() {
  const details = evmTokenConfig[Networks.Base][EvmToken.BRLA];
  if (!details) {
    throw new Error("BRLA token config missing for Base");
  }
  return details;
}
const brlaTokenDetails = requireBrlaOnBase();
const BRLA_ON_BASE = brlaTokenDetails.erc20AddressSourceChain as `0x${string}`;

const TAX_ID = "12345678901";
const HAPPY_PATH_PHASES: RampPhase[] = ["initial", "brlaOnrampMint", "fundEphemeral", "destinationTransfer", "complete"];

interface CorridorSetup {
  rampId: string;
  quoteId: string;
  /** Raw (18-decimal) BRLA amount the presigned transfer pays out. */
  amountRaw: bigint;
  signedTransfer: `0x${string}`;
  ephemeral: PrivateKeyAccount;
  destination: `0x${string}`;
}

/**
 * Corridor scenario tests for the BRL onramp direct path (pix → BRLA on Base):
 * quote and registration go through the real HTTP API, then the REAL
 * PhaseProcessor drives initial → brlaOnrampMint → fundEphemeral →
 * destinationTransfer → complete against the fake external world.
 */
describe("BRL onramp direct corridor (pix → BRLA on Base)", () => {
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
    world.brla.onPixOutputTicket = undefined;
    world.brla.accountBalances = { BRLA: 0, USDC: 0, USDM: 0, USDT: 0 };
  });

  async function createQuoteViaApi(): Promise<{ id: string; outputAmount: string }> {
    const response = await app.request("/v1/quotes", {
      body: JSON.stringify({
        from: "pix",
        inputAmount: "100",
        inputCurrency: FiatToken.BRL,
        network: Networks.Base,
        outputCurrency: EvmToken.BRLA,
        rampType: RampDirection.BUY,
        to: Networks.Base
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(response.status).toBe(201);
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
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string };
  }

  /**
   * Creates quote + registration through the HTTP API with a fresh ephemeral
   * key pair (fresh addresses keep the in-memory EVM ledger isolated between
   * tests), then stores a REAL signed ERC-20 transfer as the presigned
   * destinationTransfer. Pass a recipient to sign a transfer that pays someone
   * other than the registered destination.
   */
  async function setUpRegisteredRamp(options: { recipient?: `0x${string}` } = {}): Promise<CorridorSetup> {
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const destination = privateKeyToAccount(generatePrivateKey()).address;

    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });
    const quote = await createQuoteViaApi();
    const ramp = await registerViaApi(quote.id, user.id, ephemeral, destination);

    const amountRaw = parseUnits(quote.outputAmount, brlaTokenDetails.decimals);
    const signedTransfer = await ephemeral.signTransaction({
      chainId: 8453,
      data: encodeFunctionData({
        abi: erc20Abi,
        args: [options.recipient ?? destination, amountRaw],
        functionName: "transfer"
      }),
      gas: 100_000n,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      nonce: 0,
      to: BRLA_ON_BASE,
      type: "eip1559"
    });

    const rampState = await RampState.findByPk(ramp.id);
    if (!rampState) {
      throw new Error("Ramp state not found after registration");
    }
    await rampState.update({
      presignedTxs: [
        {
          meta: {},
          network: Networks.Base,
          nonce: 0,
          phase: "destinationTransfer",
          signer: ephemeral.address,
          txData: signedTransfer
        }
      ]
    });

    return { amountRaw, destination, ephemeral, quoteId: quote.id, rampId: ramp.id, signedTransfer };
  }

  /**
   * Scripts the fake world so every polling loop in the corridor succeeds on
   * its first (immediate) check:
   * - the Avenia subaccount already holds the minted BRL,
   * - the ephemeral already has Base gas, so fundEphemeral sends nothing,
   * - the Avenia→Base transfer ticket credits the ephemeral's BRLA instantly,
   * - submitted raw ERC-20 transfers are applied to the in-memory ledger.
   */
  function scriptHappyWorld(setup: CorridorSetup): void {
    world.brla.accountBalances.BRLA = 1_000_000;
    world.evm.setNativeBalance(Networks.Base, setup.ephemeral.address, parseUnits("0.001", 18));
    world.brla.onPixOutputTicket = ({ walletAddress }) => {
      if (walletAddress) {
        world.evm.setErc20Balance(Networks.Base, BRLA_ON_BASE, walletAddress, parseUnits("1000000", 18));
      }
    };
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

  function submissionsOf(signedTransfer: `0x${string}`): number {
    return world.evm.sentTransactions.filter(tx => tx.serialized === signedTransfer).length;
  }

  it(
    "happy path: processes initial → brlaOnrampMint → fundEphemeral → destinationTransfer → complete",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      const pixOutBefore = world.brla.pixOutputTickets.length;

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(final?.state.destinationTransferTxHash).toBeTruthy();

      // Quote stays consumed; no subsidy is expected on the direct corridor.
      const quote = await QuoteTicket.findByPk(setup.quoteId);
      expect(quote?.status).toBe("consumed");
      expect(await Subsidy.count()).toBe(0);

      // The full Avenia mint flow ran (recovery shortcut not taken) and the
      // destination received exactly the quoted BRLA per the fake ledger.
      expect(world.brla.pixOutputTickets.length).toBe(pixOutBefore + 1);
      expect(submissionsOf(setup.signedTransfer)).toBe(1);
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, setup.destination)).toBe(setup.amountRaw);
    },
    30000
  );

  it(
    "transient failure: retries a failed destinationTransfer broadcast (recoverable) and still completes",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      world.evm.failNextSends = 1;
      world.evm.sendFailureMessage = "FakeEvm: scripted RPC outage";

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });

      // The scripted outage was recorded as a recoverable destinationTransfer error...
      const outageLogs = final?.errorLogs.filter(log => log.error.includes("scripted RPC outage")) ?? [];
      expect(outageLogs.length).toBeGreaterThanOrEqual(1);
      expect(outageLogs.every(log => log.phase === "destinationTransfer")).toBe(true);
      expect(outageLogs.some(log => log.recoverable === true)).toBe(true);

      // ...and the transfer was broadcast exactly once (first attempt never hit the chain).
      expect(submissionsOf(setup.signedTransfer)).toBe(1);
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, setup.destination)).toBe(setup.amountRaw);
    },
    30000
  );

  it(
    "security regression: presigned transfer paying the wrong recipient fails the ramp unrecoverably",
    async () => {
      const wrongRecipient = privateKeyToAccount(generatePrivateKey()).address;
      const setup = await setUpRegisteredRamp({ recipient: wrongRecipient });
      scriptHappyWorld(setup);

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("failed");
      expect(final?.phaseHistory.map(entry => entry.phase)).not.toContain("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(final?.errorLogs.some(log => log.error.includes("recipient mismatch"))).toBe(true);

      // The mismatching transfer must never reach the chain, and nobody gets paid.
      expect(submissionsOf(setup.signedTransfer)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, wrongRecipient)).toBe(0n);
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, setup.destination)).toBe(0n);

      const quote = await QuoteTicket.findByPk(setup.quoteId);
      expect(quote?.status).toBe("consumed");
    },
    30000
  );

  it(
    "lock behavior: concurrent processRamp calls execute each phase exactly once",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      const pixOutBefore = world.brla.pixOutputTickets.length;

      await Promise.all([phaseProcessor.processRamp(setup.rampId), phaseProcessor.processRamp(setup.rampId)]);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      // No duplicated phase execution: one mint ticket, one broadcast, one payout, a single clean history.
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);
      expect(world.brla.pixOutputTickets.length).toBe(pixOutBefore + 1);
      expect(submissionsOf(setup.signedTransfer)).toBe(1);
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, setup.destination)).toBe(setup.amountRaw);
    },
    30000
  );
});
