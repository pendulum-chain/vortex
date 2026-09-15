import { afterAll, describe, expect, it, mock } from "bun:test";
import {
  EphemeralAccountType,
  Networks,
  type PresignedTx,
  type SignedTypedData
} from "@vortexfi/shared";
import Big from "big.js";
import { Signature as EvmSignature } from "ethers";
import { decodeFunctionData, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as financialOperationNamespace from "../core/financial-operation";
import { allocateNonces } from "../core/prepare";
import { MONERIUM_EURE, MONERIUM_ISSUE_NETWORKS } from "../phases/monerium-issue/simulation";
import { moneriumTransferFromAbi } from "../phases/monerium-self-transfer/contract";
import { registerMoneriumSelfTransfer } from "../phases/monerium-self-transfer/registration";
import {
  MoneriumSelfTransferContext,
  simulateMoneriumSelfTransfer
} from "../phases/monerium-self-transfer/simulation";
import { prepareMoneriumSelfTransferTxs } from "../phases/monerium-self-transfer/transactions";

const financialOperationReal = { ...financialOperationNamespace };
const operationAttempts: string[] = [];

mock.module("../core/financial-operation", () => ({
  ...financialOperationReal,
  requireFinancialFlowIdentity: () => ({ id: "test-flow", version: 1 }),
  runFinancialOperation: async ({ attemptClass, perform }: { attemptClass: string; perform(key: string): Promise<unknown> }) => {
    operationAttempts.push(attemptClass);
    return perform(`test-${attemptClass}`);
  }
}));

const { MoneriumSelfTransferExecutor } = await import("../phases/monerium-self-transfer/execution");

afterAll(() => {
  mock.module("../core/financial-operation", () => ({ ...financialOperationReal }));
});

const owner = privateKeyToAccount("0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
const ephemeral = privateKeyToAccount("0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd");
const amountRaw = "1230000000000000000";
const facts = { amountRaw, chain: Networks.Base, owner: owner.address, token: MONERIUM_EURE } as const;

function metadata() {
  return { amount: new Big("1.23"), amountRaw, chain: Networks.Base, token: MONERIUM_EURE } as const;
}

describe("MoneriumSelfTransfer block", () => {
  it("simulates an exact EURE-on-Base passthrough", async () => {
    const input = { amount: new Big("1.23"), amountRaw, chain: Networks.Base, token: MONERIUM_EURE } as const;
    const notes: string[] = [];
    const result = await simulateMoneriumSelfTransfer(input, {
      addNote: note => notes.push(note),
      notes,
      now: new Date(),
      partner: null,
      request: {} as never
    });

    expect(result.output).toBe(input);
    expect(result.metadata).toEqual(metadata());
    expect(notes).toHaveLength(1);
  });

  it("binds only trusted Monerium issue owner/token/chain/amount facts", async () => {
    const registered = await registerMoneriumSelfTransfer({
      authenticatedUser: { id: "user-1" },
      input: { owner: "0x1111111111111111111111111111111111111111", untrusted: "ignored" },
      metadata: metadata(),
      priorRegistrationFacts: { moneriumIssue: { ...facts, providerOrder: "must-not-copy" } },
      quote: {} as never,
      signingAccounts: [{ address: ephemeral.address, type: EphemeralAccountType.EVM }]
    });

    expect(registered.facts).toEqual(facts);
    expect(registered.facts).not.toHaveProperty("providerOrder");
    expect(registered.facts).not.toHaveProperty("untrusted");
    await expect(
      registerMoneriumSelfTransfer({
        authenticatedUser: { id: "user-1" },
        input: {},
        metadata: metadata(),
        priorRegistrationFacts: { moneriumIssue: { ...facts, amountRaw: "1" } },
        quote: {} as never,
        signingAccounts: [{ address: ephemeral.address, type: EphemeralAccountType.EVM }]
      })
    ).rejects.toThrow("do not match the quoted transfer");
  });

  it("rejects an owner that is also the EVM ephemeral", async () => {
    await expect(
      registerMoneriumSelfTransfer({
        authenticatedUser: { id: "user-1" },
        input: {},
        metadata: metadata(),
        priorRegistrationFacts: { moneriumIssue: facts },
        quote: {} as never,
        signingAccounts: [{ address: owner.address, type: EphemeralAccountType.EVM }]
      })
    ).rejects.toThrow("owner must differ from the EVM ephemeral account");
  });

  it("prepares an owner permit and exact ephemeral transferFrom in independent nonce lanes", async () => {
    const prepared = await prepareMoneriumSelfTransferTxs(
      {
        accounts: { EVM: { address: ephemeral.address, type: EphemeralAccountType.EVM } },
        globals: {} as never,
        ownMetadata: metadata(),
        ownRegistrationFacts: facts,
        quote: {} as never
      },
      {
        now: () => 1_700_000_000_000,
        probe: async () => ({
          maxFeePerGas: 2_000_000_000n,
          maxPriorityFeePerGas: 1_000_000n,
          nonce: 7n,
          tokenName: "EURe"
        })
      }
    );
    const [permit, transfer] = allocateNonces(prepared.intents);
    const typedData = permit.txData as SignedTypedData;
    const decoded = decodeFunctionData({
      abi: moneriumTransferFromAbi,
      data: (transfer.txData as { data: `0x${string}` }).data
    });
    const tokenAddress = MONERIUM_ISSUE_NETWORKS[Networks.Base].eureAddress;

    expect(permit.signer).toBe(owner.address);
    expect(permit.nonce).toBe(0);
    expect(typedData.message).toMatchObject({
      nonce: "7",
      owner: owner.address,
      spender: ephemeral.address,
      value: amountRaw
    });
    expect(transfer.signer).toBe(ephemeral.address);
    expect(transfer.nonce).toBe(0);
    expect(transfer.txData).toMatchObject({
      gas: "300000",
      to: tokenAddress,
      value: "0"
    });
    expect(decoded.args).toEqual([owner.address, ephemeral.address, BigInt(amountRaw)]);
    expect(prepared.intents[1].prefundNativeValueRaw).toBe("1800000000000000");
  });

  it("uses the sandbox EURe contract and chain ID on Base Sepolia", async () => {
    const sandboxFacts = { ...facts, chain: Networks.BaseSepolia } as const;
    const prepared = await prepareMoneriumSelfTransferTxs(
      {
        accounts: { EVM: { address: ephemeral.address, type: EphemeralAccountType.EVM } },
        globals: {} as never,
        ownMetadata: { ...metadata(), chain: Networks.BaseSepolia },
        ownRegistrationFacts: sandboxFacts,
        quote: {} as never
      },
      {
        probe: async () => ({
          maxFeePerGas: 2_000_000_000n,
          maxPriorityFeePerGas: 1_000_000n,
          nonce: 0n,
          tokenName: "EURe"
        })
      }
    );
    const [permit, transfer] = allocateNonces(prepared.intents);
    const typedData = permit.txData as SignedTypedData;
    const sandboxTokenAddress = MONERIUM_ISSUE_NETWORKS[Networks.BaseSepolia].eureAddress;

    expect(permit.network).toBe(Networks.BaseSepolia);
    expect(transfer.network).toBe(Networks.BaseSepolia);
    expect(typedData.domain.chainId).toBe(84532);
    expect(typedData.domain.verifyingContract).toBe(sandboxTokenAddress);
  });

  it("uses the requested non-Base Monerium network", async () => {
    const polygonFacts = { ...facts, chain: Networks.Polygon } as const;
    const prepared = await prepareMoneriumSelfTransferTxs(
      {
        accounts: { EVM: { address: ephemeral.address, type: EphemeralAccountType.EVM } },
        globals: {} as never,
        ownMetadata: { ...metadata(), chain: Networks.Polygon },
        ownRegistrationFacts: polygonFacts,
        quote: {} as never
      },
      {
        probe: async () => ({
          maxFeePerGas: 2_000_000_000n,
          maxPriorityFeePerGas: 1_000_000n,
          nonce: 0n,
          tokenName: "EURe"
        })
      }
    );
    const [permit, transfer] = allocateNonces(prepared.intents);
    const typedData = permit.txData as SignedTypedData;
    const polygonTokenAddress = MONERIUM_ISSUE_NETWORKS[Networks.Polygon].eureAddress;

    expect(permit.network).toBe(Networks.Polygon);
    expect(transfer.network).toBe(Networks.Polygon);
    expect(typedData.domain.chainId).toBe(137);
    expect(typedData.domain.verifyingContract).toBe(polygonTokenAddress);
  });

  it("consumes a current permit even when allowance already covers the transfer", async () => {
    operationAttempts.length = 0;
    const prepared = await prepareMoneriumSelfTransferTxs(
      {
        accounts: { EVM: { address: ephemeral.address, type: EphemeralAccountType.EVM } },
        globals: {} as never,
        ownMetadata: metadata(),
        ownRegistrationFacts: facts,
        quote: {} as never
      },
      {
        now: () => Date.now(),
        probe: async () => ({
          maxFeePerGas: 2_000_000_000n,
          maxPriorityFeePerGas: 1_000_000n,
          nonce: 7n,
          tokenName: "EURe"
        })
      }
    );
    const [permitBlueprint, transferBlueprint] = allocateNonces(prepared.intents);
    const unsignedPermit = permitBlueprint.txData as SignedTypedData;
    const permitHex = await owner.signTypedData({
      domain: unsignedPermit.domain,
      message: unsignedPermit.message,
      primaryType: unsignedPermit.primaryType,
      types: unsignedPermit.types
    });
    const permitSignature = EvmSignature.from(permitHex);
    const signedPermit: PresignedTx = {
      ...permitBlueprint,
      txData: [{
        ...unsignedPermit,
        signature: {
          deadline: Number(unsignedPermit.message.deadline),
          r: permitSignature.r as `0x${string}`,
          s: permitSignature.s as `0x${string}`,
          v: permitSignature.v
        }
      }]
    };
    const rawTransfer = await ephemeral.signTransaction({
      chainId: 8453,
      data: (transferBlueprint.txData as { data: `0x${string}` }).data,
      gas: 300_000n,
      maxFeePerGas: 2_000_000_000n,
      maxPriorityFeePerGas: 1_000_000n,
      nonce: 0,
      to: (transferBlueprint.txData as { to: `0x${string}` }).to,
      type: "eip1559",
      value: 0n
    });
    const signedTransfer: PresignedTx = { ...transferBlueprint, txData: rawTransfer };
    const permitHash = `0x${"11".repeat(32)}` as `0x${string}`;
    const transferHash = keccak256(rawTransfer);
    let permitNonce = 7n;
    let transferSent = false;
    let permitCalls = 0;
    const state = {
      currentPhase: "moneriumOnrampSelfTransfer",
      errorLogs: [],
      get() {
        return this;
      },
      id: "ramp-1",
      phaseHistory: [],
      presignedTxs: [signedPermit, signedTransfer],
      state: {
        accountAddresses: { EVM: ephemeral.address },
        blockState: { [MoneriumSelfTransferContext.key]: facts },
        flow: { id: "test-flow", version: 1 }
      },
      unsignedTxs: [permitBlueprint, transferBlueprint],
      async update(update: Record<string, unknown>) {
        Object.assign(this, update);
        return this;
      }
    } as any;
    const executor = new MoneriumSelfTransferExecutor({
      getAllowance: async () => (transferSent ? 0n : BigInt(amountRaw)),
      getPermitNonce: async () => permitNonce,
      getReceipt: async () => ({ status: "success" }),
      getTransactionCount: async () => 0,
      sendPermit: async () => {
        permitCalls++;
        permitNonce++;
        return permitHash;
      },
      sendRawTransaction: async () => {
        transferSent = true;
        return transferHash;
      },
      waitForReceipt: async () => ({ status: "success" })
    });

    await executor.execute(state);

    expect(permitCalls).toBe(1);
    expect(operationAttempts).toEqual(["monerium-permit", "monerium-transfer-from"]);
    expect(state.state.blockState.moneriumSelfTransfer).toMatchObject({ permitTxHash: permitHash, transferTxHash: transferHash });
    expect(state.state).not.toHaveProperty("permitTxHash");
    expect(state.state).not.toHaveProperty("moneriumOnrampSelfTransferHash");
  });
});
