import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  EphemeralAccountType,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  type IbanPaymentData,
  MykoboApiService,
  MykoboCurrency,
  MykoboCustomerStatus,
  MykoboTransactionType,
  Networks,
  RampDirection,
  type RampPhase,
  type UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { decodeFunctionData, encodeFunctionData, erc20Abi, parseTransaction, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import phaseProcessor from "../../api/services/phases/phase-processor";
import { resolveMykoboCustomerForUser } from "../../api/services/mykobo/mykobo-customer.service";
import { normalizeAndValidateSigningAccounts } from "../../api/services/ramp/ramp.service";
import { validateEphemeralAccountsFresh } from "../../api/services/ramp/ephemeral-freshness";
import { prepareMykoboToEvmOnrampTransactions } from "../../api/services/transactions/onramp/routes/mykobo-to-evm";
import MykoboCustomer from "../../models/mykoboCustomer.model";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestRampState, createTestUser } from "../../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../../test-utils/test-app";

function requireEurcOnBase() {
  const details = evmTokenConfig[Networks.Base][EvmToken.EURC];
  if (!details) {
    throw new Error("EURC token config missing for Base");
  }
  return details;
}
const eurcTokenDetails = requireEurcOnBase();
const EURC_ON_BASE = eurcTokenDetails.erc20AddressSourceChain as `0x${string}`;

const IP_ADDRESS = "203.0.113.7";

const HAPPY_PATH_PHASES: RampPhase[] = ["initial", "mykoboOnrampDeposit", "fundEphemeral", "destinationTransfer", "complete"];

interface CorridorSetup {
  rampId: string;
  quoteId: string;
  /** Raw (6-decimal) EURC amount Mykobo settles on the ephemeral (input minus anchor fee). */
  mykoboMintRaw: bigint;
  /** Raw (6-decimal) EURC amount the presigned transfer pays out. */
  amountRaw: bigint;
  signedTransfer: `0x${string}`;
  ephemeral: PrivateKeyAccount;
  destination: `0x${string}`;
  mykoboTransactionId: string;
}

/**
 * Corridor scenario tests for the EUR onramp direct path (SEPA → EURC on Base
 * via Mykobo): the quote goes through the real HTTP API; registration is then
 * seeded through the SAME code the registration service runs below its EUR
 * kill-switch (`registerRamp` in ramp.service.ts throws 503 for EURC quotes
 * BEFORE preparing transactions, so the HTTP entry point is unavailable — see
 * `registerEurOnrampBelowKillSwitch` below). The REAL PhaseProcessor then
 * drives initial → mykoboOnrampDeposit → fundEphemeral → destinationTransfer
 * → complete against the fake external world.
 *
 * This scenario is the hermetic-coverage precondition documented next to the
 * kill-switch and in docs/testing-strategy.md ("EUR re-enablement
 * precondition"). The kill-switch itself stays on; once it is lifted, replace
 * the seeding helper with a plain POST /v1/ramp/register like the BRL/MXN
 * corridor files.
 */
describe("EUR onramp direct corridor (SEPA → EURC on Base via Mykobo)", () => {
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
    world.mykobo.failNextIntent = null;
    world.mykobo.profileKycReviewStatus = "approved";
  });

  async function createQuoteViaApi(): Promise<{ id: string; outputAmount: string }> {
    const response = await app.request("/v1/quotes", {
      body: JSON.stringify({
        from: "sepa",
        inputAmount: "100",
        inputCurrency: FiatToken.EURC,
        network: Networks.Base,
        outputCurrency: EvmToken.EURC,
        rampType: RampDirection.BUY,
        to: Networks.Base
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string; outputAmount: string };
  }

  /**
   * Kill-switch check: the REAL /v1/ramp/register endpoint must keep refusing
   * EUR quotes with 503 until the re-enablement precondition is lifted. The
   * seeding below deliberately starts where this rejection ends.
   */
  async function assertRegisterEndpointStillKillSwitched(quoteId: string, userId: string, destination: string): Promise<void> {
    const response = await app.request("/v1/ramp/register", {
      body: JSON.stringify({
        additionalData: { destinationAddress: destination, ipAddress: IP_ADDRESS },
        quoteId,
        signingAccounts: [{ address: destination, type: "EVM" }]
      }),
      headers: {
        Authorization: `Bearer ${testUserToken(userId)}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    expect(response.status).toBe(503);
  }

  /**
   * Registers the ramp exactly as `RampService.registerRamp` would if the EUR
   * kill-switch were lifted, by running the same sequence of service calls the
   * method performs below the switch (ramp.service.ts): signing-account
   * normalization, ephemeral freshness validation, the Mykobo customer/KYC
   * resolution + deposit intent (mirroring prepareMykoboOnrampTransactions),
   * the REAL transaction builder, quote consumption, and a RampState row with
   * the identical shape. No registration logic is re-implemented — only the
   * thin glue is mirrored.
   */
  async function registerEurOnrampBelowKillSwitch(
    quote: QuoteTicket,
    userId: string,
    ephemeral: PrivateKeyAccount,
    destination: `0x${string}`
  ): Promise<RampState> {
    const additionalData = { destinationAddress: destination, ipAddress: IP_ADDRESS };

    const { normalizedSigningAccounts, ephemerals } = normalizeAndValidateSigningAccounts([
      { address: ephemeral.address, type: EphemeralAccountType.EVM }
    ]);
    await validateEphemeralAccountsFresh(ephemerals);

    // Mirrors prepareMykoboOnrampTransactions: derive the Mykobo identity from
    // the user's profile (KYC-gated), create the deposit intent, then build.
    const { email } = await resolveMykoboCustomerForUser(userId);
    const intent = await MykoboApiService.getInstance().createTransactionIntent({
      currency: MykoboCurrency.EURC,
      email_address: email,
      ip_address: additionalData.ipAddress,
      transaction_type: MykoboTransactionType.DEPOSIT,
      value: new Big(quote.inputAmount).toFixed(2, 0),
      wallet_address: ephemeral.address
    });
    if (!intent.instructions || !("iban" in intent.instructions)) {
      throw new Error("FakeMykobo deposit intent did not return IBAN instructions");
    }

    const { unsignedTxs, stateMeta } = await prepareMykoboToEvmOnrampTransactions({
      destinationAddress: additionalData.destinationAddress,
      ipAddress: additionalData.ipAddress,
      mykoboEmail: email,
      mykoboTransactionId: intent.transaction.id,
      mykoboTransactionReference: intent.transaction.reference,
      quote,
      signingAccounts: normalizedSigningAccounts
    });

    const ibanPaymentData: IbanPaymentData = {
      bic: "",
      iban: intent.instructions.iban,
      receiverName: intent.instructions.bank_account_name,
      reference: intent.transaction.reference
    };

    const [consumed] = await QuoteTicket.update({ status: "consumed" }, { where: { id: quote.id, status: "pending" } });
    expect(consumed).toBe(1);

    return createTestRampState({
      currentPhase: "initial",
      from: quote.from,
      paymentMethod: quote.paymentMethod,
      phaseHistory: [{ phase: "initial", timestamp: new Date() }],
      quoteId: quote.id,
      state: {
        evmEphemeralAddress: ephemerals.EVM,
        ibanPaymentData,
        substrateEphemeralAddress: ephemerals.Substrate,
        ...additionalData,
        ...stateMeta
      } as unknown as RampState["state"],
      to: quote.to,
      type: quote.rampType,
      unsignedTxs,
      userId
    });
  }

  /**
   * Quote via the real HTTP API, registration via the below-kill-switch
   * seeding, then a REAL signed EURC transfer stored as the presigned
   * destinationTransfer (pass a recipient to tamper with the payee).
   */
  async function setUpRegisteredRamp(options: { recipient?: `0x${string}` } = {}): Promise<CorridorSetup> {
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const destination = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;

    const user = await createTestUser();
    const quote = await createQuoteViaApi();
    await assertRegisterEndpointStillKillSwitched(quote.id, user.id, destination);

    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    if (!persistedQuote) {
      throw new Error("Quote not persisted");
    }
    const mykoboMintRaw = BigInt(persistedQuote.metadata.mykoboMint?.outputAmountRaw ?? "0");
    expect(mykoboMintRaw).toBeGreaterThan(0n);

    const rampState = await registerEurOnrampBelowKillSwitch(persistedQuote, user.id, ephemeral, destination);

    const blueprint = (rampState.unsignedTxs ?? []).find(tx => tx.phase === "destinationTransfer");
    expect(blueprint, "missing destinationTransfer blueprint").toBeDefined();
    const blueprintData = (blueprint as UnsignedTx).txData as unknown as { to: `0x${string}`; data: `0x${string}` };
    const decoded = decodeFunctionData({ abi: erc20Abi, data: blueprintData.data });
    const amountRaw = (decoded.args as [string, bigint])[1];
    expect(amountRaw).toBe(parseUnits(quote.outputAmount, eurcTokenDetails.decimals));

    const signedTransfer = await ephemeral.signTransaction({
      chainId: 8453,
      data: options.recipient
        ? encodeFunctionData({ abi: erc20Abi, args: [options.recipient, amountRaw], functionName: "transfer" })
        : blueprintData.data,
      gas: 100_000n,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      nonce: (blueprint as UnsignedTx).nonce,
      to: blueprintData.to,
      type: "eip1559"
    });

    await rampState.update({
      presignedTxs: [
        {
          meta: {},
          network: Networks.Base,
          nonce: (blueprint as UnsignedTx).nonce,
          phase: "destinationTransfer",
          signer: ephemeral.address,
          txData: signedTransfer
        }
      ]
    });

    return {
      amountRaw,
      destination,
      ephemeral,
      mykoboMintRaw,
      mykoboTransactionId: rampState.state.mykoboTransactionId as string,
      quoteId: quote.id,
      rampId: rampState.id,
      signedTransfer
    };
  }

  /**
   * Scripts the fake world for the happy path:
   * - Mykobo's SEPA settlement already delivered the EURC on the ephemeral,
   * - the ephemeral has Base gas so fundEphemeral sends nothing,
   * - broadcast raw ERC-20 transfers are applied to the in-memory ledger.
   */
  function scriptHappyWorld(setup: CorridorSetup): void {
    world.evm.setNativeBalance(Networks.Base, setup.ephemeral.address, parseUnits("2", 18));
    world.evm.setErc20Balance(Networks.Base, EURC_ON_BASE, setup.ephemeral.address, setup.mykoboMintRaw);
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
    "happy path: processes initial → mykoboOnrampDeposit → fundEphemeral → destinationTransfer → complete",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(final?.state.destinationTransferTxHash).toBeTruthy();

      // Quote stays consumed and the destination received exactly the quoted
      // EURC per the fake ledger.
      const quote = await QuoteTicket.findByPk(setup.quoteId);
      expect(quote?.status).toBe("consumed");
      expect(submissionsOf(setup.signedTransfer)).toBe(1);
      expect(world.evm.erc20Balance(Networks.Base, EURC_ON_BASE, setup.destination)).toBe(setup.amountRaw);

      // Registration created exactly one Mykobo DEPOSIT intent addressed at
      // the ephemeral for the full EUR input, and the KYC mirror was synced.
      const intents = world.mykobo.intents.filter(intent => intent.wallet_address === setup.ephemeral.address);
      expect(intents.length).toBe(1);
      expect(intents[0].transaction_type).toBe(MykoboTransactionType.DEPOSIT);
      expect(intents[0].value).toBe("100.00");
      expect((await MykoboCustomer.findOne({ where: { userId: final?.userId as string } }))?.status).toBe(
        MykoboCustomerStatus.APPROVED
      );
    },
    30000
  );

  it(
    "transient failure: a scripted RPC outage on the destination transfer is recoverable and the corridor still completes",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      world.evm.failNextSends = 1;
      world.evm.sendFailureMessage = "FakeEvm: scripted RPC outage";

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });

      const outageLogs = final?.errorLogs.filter(log => log.error.includes("scripted RPC outage")) ?? [];
      expect(outageLogs.length).toBeGreaterThanOrEqual(1);
      expect(outageLogs.every(log => log.phase === "destinationTransfer")).toBe(true);
      expect(outageLogs.some(log => log.recoverable === true)).toBe(true);

      expect(submissionsOf(setup.signedTransfer)).toBe(1);
      expect(world.evm.erc20Balance(Networks.Base, EURC_ON_BASE, setup.destination)).toBe(setup.amountRaw);
    },
    30000
  );

  it(
    "unrecoverable failure: a presigned transfer paying the wrong recipient fails the ramp without paying anyone",
    async () => {
      const wrongRecipient = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;
      const setup = await setUpRegisteredRamp({ recipient: wrongRecipient });
      scriptHappyWorld(setup);

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("failed");
      expect(final?.phaseHistory.map(entry => entry.phase)).not.toContain("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(final?.errorLogs.some(log => log.error.includes("recipient mismatch"))).toBe(true);

      expect(submissionsOf(setup.signedTransfer)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Base, EURC_ON_BASE, wrongRecipient)).toBe(0n);
      expect(world.evm.erc20Balance(Networks.Base, EURC_ON_BASE, setup.destination)).toBe(0n);
    },
    30000
  );

  it(
    "registration guard: an unapproved Mykobo KYC blocks the EUR onramp registration path",
    async () => {
      world.mykobo.profileKycReviewStatus = "pending";
      const user = await createTestUser();
      const quote = await createQuoteViaApi();
      const persistedQuote = await QuoteTicket.findByPk(quote.id);
      const ephemeral = privateKeyToAccount(generatePrivateKey());
      const destination = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;
      const intentsBefore = world.mykobo.intents.length;

      await expect(
        registerEurOnrampBelowKillSwitch(persistedQuote as QuoteTicket, user.id, ephemeral, destination)
      ).rejects.toThrow("Mykobo KYC is not approved");
      // No intent was created and the quote was not consumed.
      expect(world.mykobo.intents.length).toBe(intentsBefore);
      expect((await QuoteTicket.findByPk(quote.id))?.status).toBe("pending");
    },
    30000
  );
});
