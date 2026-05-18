import { describe, expect, it } from "bun:test";
import { Signature as EthersSignature, Wallet } from "ethers";
import { EphemeralAccountType, Networks, PresignedTx, RampDirection, SignedTypedData, EvmTransactionData } from "@vortexfi/shared";
import { areAllTxsIncluded, validatePresignedTxs } from "./validation";
import { NUMBER_OF_PRESIGNED_TXS } from "@vortexfi/shared";

const EVM_WALLET = new Wallet("0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
const EVM_SIGNER = EVM_WALLET.address;
const EVM_SIGNER_2 = "0x876452cC7a2280560d39e7E8aEBc9d1bAAbd4fEa";

// Mock txData used for non-EVM transactions. These are valid SCALE/XDR payloads that pass
// api.tx() / TransactionBuilder.fromXDR() parsing. The validation function checks signer/structure,
// not that the payload matches a specific unsigned transaction (for non-EVMs).
// NOTE: Substrate txData embeds the signer in the extrinsic, so each signer needs its own mock.
const MOCK_TX_DATA_SUBSTRATE_SIGNER_1 = "0x71038400ac1767af9bf4282c0f268b5ce1797db8f19eaf9a748f2d9519905654b9c292370162bd23e90ef57a53ec3360bba0b3c1a735dfa22251bd5800105241d94006cd2f9484ba4494f57fb6b00aba9fb6b8a11effb73a22fda6223eb4abe5169ab30d880000000038060093dfde426795690be15b2071741d6538cd265eb673a9e9a1ae4e4389fda96a620007cdd55d7302ce800200001101095ea7b3e0a5f34199e165cbd3f9b0eba1f5e15d5018a7ffe8b76a3693ba5b317efb09d800005dccfd995e80000000000000000000000000000000000000000000000000";

const MOCK_TX_DATA_SUBSTRATE_SIGNER_2 = "0x71038400b61dacc574163a9e8da2aca2b29090c610e61b21de9adbafb699156b6b6d9465019c7a2a23097caa54fcdd14432c731bd7c7c82a5648ee6d9a12378af3e241b435f2675ee515c50edfdf9098318c8a31abcc511d52a76133ad9e6b35cf5209bb8d000000003806005c1026460683b902672db0bbf65df0c021f5c9f844663e4dd1fcb13935ac6ba600072a494093029e820200001101095ea7b3e0a5f34199e165cbd3f9b0eba1f5e15d5018a7ffe8b76a3693ba5b317efb09d8e0ccb60000000000000000000000000000000000000000000000000000000000";

// Stellar mock payloads — each phase has different operation-count requirements
const MOCK_TX_DATA_STELLAR_CREATE_ACCOUNT = "AAAAAgAAAADkOCw1GPsc4U0bNLBfqRtbB05ZcogqYJfDKZYB95sHRAAtxsADWqM3AAAArQAAAAIAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAABb98/OGp4OrOMF58ADgwMHgBEvumr4FGRDfL2ZggooKAAAAAABfXhAAAAAAQAAAABb98/OGp4OrOMF58ADgwMHgBEvumr4FGRDfL2ZggooKAAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAIAAAABAAAAAgAAAAEAAAACAAAAAAAAAAEAAAAA5DgsNRj7HOFNGzSwX6kbWwdOWXKIKmCXwymWAfebB0QAAAABAAAAAQAAAABb98/OGp4OrOMF58ADgwMHgBEvumr4FGRDfL2ZggooKAAAAAYAAAABRVVSQwAAAADPT1om4gkLs63PAsep1z2/5mWcxpBGFHW4ZDf6SccRNn//////////AAAAAAAAAAL3mwdEAAAAQCsExvxklazpsIDVJtyQU8Ou969v8j1NeM/MDMATo0UlUifWtbb218kd+ql6i21PQbD7ibxm6M4Zp1zflDIRMwOCCigoAAAAQF1MLyxdcdQ9lMYiR8iHye4TIKoP9zOimi4AKCL87rgDeXbEazuVR0GS0ILjnsc3NLFySKtAWcUFX20XXp7v5Aw=";

const MOCK_TX_DATA_STELLAR_PAYMENT = "AAAAAgAAAABb98/OGp4OrOMF58ADgwMHgBEvumr4FGRDfL2ZggooKAAPQkADjNQFAAAAAQAAAAIAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAA1NWUsxNzYxNDkyNzc2AAAAAAAAAQAAAAAAAAABAAAAAMwmH81TyAdqCkge7nLAJdasnz/JchoiBMyDM9Io97NEAAAAAUVVUkMAAAAAz09aJuIJC7OtzwLHqdc9v+ZlnMaQRhR1uGQ3+knHETYAAAAABh8T4AAAAAAAAAAC95sHRAAAAEB4aZkEhfZ98f+FbQSEj0wFNirD7fe2HiWLM9jIuvkoQ9ruzSxycCK+NMiIgppZnNSNnibw10BseXsG9kjK1u0KggooKAAAAED8tHWEfIKPzeuHVBnMy9x+ireQ6kepvWCLq/ZRyXWN8m+lcE0r60HwjD25xJovaY9hyVh9X50o/xm0dM6DlIsF";

const MOCK_TX_DATA_STELLAR_CLEANUP = "AAAAAgAAAABb98/OGp4OrOMF58ADgwMHgBEvumr4FGRDfL2ZggooKAAehIADjNQFAAAAAgAAAAIAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAABgAAAAFFVVJDAAAAAM9PWibiCQuzrc8Cx6nXPb/mZZzGkEYUdbhkN/pJxxE2AAAAAAAAAAAAAAAAAAAACAAAAADkOCw1GPsc4U0bNLBfqRtbB05ZcogqYJfDKZYB95sHRAAAAAAAAAAC95sHRAAAAEB8+udS9KiWj8JjxxPB3HSMC0EkRvggU2hOP9IoHF8+T7VzqZiPzzwuothCSKwaOgaVvG/SSPUIKJQkpVYhjqwJggooKAAAAECSKoTeRu3ttJ9G3Cj6a79Yv6ZQTguCIlGo2klJltKvQex7SQys69T93BeoG+XALB8I8MvSiQoEXE7unZYpmL0A=";

async function makeSignedEvmTx(overrides: {
  nonce: number;
  phase: PresignedTx["phase"];
  network: Networks;
  signer?: string;
  to?: string;
  data?: string;
  value?: string;
  chainId?: number;
}): Promise<PresignedTx> {
  const to = overrides.to || "0x000000000000000000000000000000000000dEaD";
  const data = overrides.data || "0x12345678";
  const value = overrides.value || "0";
  const chainId = overrides.chainId || 137;

  const signedRawTx = await EVM_WALLET.signTransaction({
    chainId,
    data,
    gasLimit: 21000n,
    maxFeePerGas: 1000000000n,
    maxPriorityFeePerGas: 1000000000n,
    nonce: overrides.nonce,
    to,
    type: 2,
    value: BigInt(value)
  });

  return {
    meta: {},
    network: overrides.network,
    nonce: overrides.nonce,
    phase: overrides.phase,
    signer: overrides.signer || EVM_SIGNER,
    txData: signedRawTx
  };
}

// Helper function to create a signed EVM transaction with the required number of backup transactions for testing. 
// The backup transactions have incremented nonces and the same data, signer, and network as the main transaction.
async function makeSignedEvmTxWithBackups(overrides: {
  nonce: number;
  phase: PresignedTx["phase"];
  network: Networks;
  signer?: string;
  to?: string;
  data?: string;
  value?: string;
  chainId?: number;
}): Promise<PresignedTx> {
  const main = await makeSignedEvmTx(overrides);
  const additionalTxs: Record<string, PresignedTx> = {};
  for (let i = 1; i <= NUMBER_OF_PRESIGNED_TXS - 1; i++) {
    additionalTxs[`backup${i}`] = await makeSignedEvmTx({ ...overrides, nonce: overrides.nonce + i });
  }
  return { ...main, meta: { additionalTxs } };
}

// Used for non-EVM transactions where we check structure (reported nonce, amount of transactions in object) but not the actual
// signed data.
function withBackups(tx: PresignedTx): PresignedTx {
  const additionalTxs: Record<string, PresignedTx> = {};
  for (let i = 1; i <= NUMBER_OF_PRESIGNED_TXS - 1; i++) {
    additionalTxs[`backup${i}`] = { ...tx, nonce: tx.nonce + i, meta: {} };
  }
  return { ...tx, meta: { additionalTxs } };
}

const VALID_EXAMPLE_PRESIGNED_TX_EUR_ONRAMP: PresignedTx[] = await Promise.all([
  makeSignedEvmTxWithBackups({ nonce: 0, phase: "moneriumOnrampSelfTransfer", network: Networks.Polygon }),
  makeSignedEvmTxWithBackups({ nonce: 1, phase: "squidRouterApprove", network: Networks.Polygon }),
  makeSignedEvmTxWithBackups({ nonce: 2, phase: "squidRouterSwap", network: Networks.Polygon }),
]);

const VALID_EXAMPLE_UNSIGNED_TX_EUR_ONRAMP: PresignedTx[] = [
  { meta: {}, network: Networks.Polygon, nonce: 0, phase: "moneriumOnrampSelfTransfer", signer: EVM_SIGNER, txData: { data: "0x12345678", gas: "21000", maxFeePerGas: "1000000000", maxPriorityFeePerGas: "1000000000", to: "0x000000000000000000000000000000000000dEaD", value: "0" } },
  { meta: {}, network: Networks.Polygon, nonce: 1, phase: "squidRouterApprove", signer: EVM_SIGNER, txData: { data: "0x12345678", gas: "21000", maxFeePerGas: "1000000000", maxPriorityFeePerGas: "1000000000", to: "0x000000000000000000000000000000000000dEaD", value: "0" } },
  { meta: {}, network: Networks.Polygon, nonce: 2, phase: "squidRouterSwap", signer: EVM_SIGNER, txData: { data: "0x12345678", gas: "21000", maxFeePerGas: "1000000000", maxPriorityFeePerGas: "1000000000", to: "0x000000000000000000000000000000000000dEaD", value: "0" } },
];

const VALID_EXAMPLE_PRESIGNED_TX_BRL_ONRAMP: PresignedTx[] = [
  withBackups({
    meta: {},
    nonce: 0,
    phase: "nablaApprove",
    signer: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
    txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_1,
    network: Networks.Pendulum
  }),
  withBackups({
    meta: {},
    nonce: 1,
    phase: "nablaSwap",
    signer: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
    txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_1,
    network: Networks.Pendulum
  }),
  withBackups({
    meta: {},
    nonce: 2,
    phase: "distributeFees",
    signer: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
    txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_1,
    network: Networks.Pendulum
  }),
  withBackups({
    meta: {},
    nonce: 3,
    phase: "pendulumToMoonbeamXcm",
    signer: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
    txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_1,
    network: Networks.Pendulum
  }),
  withBackups({
    meta: {},
    nonce: 4,
    phase: "pendulumCleanup",
    signer: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
    txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_1,
    network: Networks.Pendulum
  }),
  await makeSignedEvmTxWithBackups({ nonce: 0, phase: "moonbeamToPendulumXcm", network: Networks.Moonbeam, signer: EVM_SIGNER_2, chainId: 1284 }),
  await makeSignedEvmTxWithBackups({ nonce: 4, phase: "moonbeamCleanup", network: Networks.Moonbeam, signer: EVM_SIGNER_2, chainId: 1284 }),
  await makeSignedEvmTxWithBackups({ nonce: 2, phase: "squidRouterApprove", network: Networks.Moonbeam, signer: EVM_SIGNER_2, chainId: 1284 }),
  await makeSignedEvmTxWithBackups({ nonce: 3, phase: "squidRouterSwap", network: Networks.Moonbeam, signer: EVM_SIGNER_2, chainId: 1284 }),
];

const VALID_EXAMPLE_UNSIGNED_TX_BRL_ONRAMP: PresignedTx[] = [
  { meta: {}, network: Networks.Pendulum, nonce: 0, phase: "nablaApprove", signer: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz", txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_1 },
  { meta: {}, network: Networks.Pendulum, nonce: 1, phase: "nablaSwap", signer: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz", txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_1 },
  { meta: {}, network: Networks.Pendulum, nonce: 2, phase: "distributeFees", signer: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz", txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_1 },
  { meta: {}, network: Networks.Pendulum, nonce: 3, phase: "pendulumToMoonbeamXcm", signer: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz", txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_1 },
  { meta: {}, network: Networks.Pendulum, nonce: 4, phase: "pendulumCleanup", signer: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz", txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_1 },
  { meta: {}, network: Networks.Moonbeam, nonce: 0, phase: "moonbeamToPendulumXcm", signer: EVM_SIGNER_2, txData: { data: "0x12345678", gas: "21000", maxFeePerGas: "1000000000", maxPriorityFeePerGas: "1000000000", to: "0x000000000000000000000000000000000000dEaD", value: "0" } },
  { meta: {}, network: Networks.Moonbeam, nonce: 4, phase: "moonbeamCleanup", signer: EVM_SIGNER_2, txData: { data: "0x12345678", gas: "21000", maxFeePerGas: "1000000000", maxPriorityFeePerGas: "1000000000", to: "0x000000000000000000000000000000000000dEaD", value: "0" } },
  { meta: {}, network: Networks.Moonbeam, nonce: 2, phase: "squidRouterApprove", signer: EVM_SIGNER_2, txData: { data: "0x12345678", gas: "21000", maxFeePerGas: "1000000000", maxPriorityFeePerGas: "1000000000", to: "0x000000000000000000000000000000000000dEaD", value: "0" } },
  { meta: {}, network: Networks.Moonbeam, nonce: 3, phase: "squidRouterSwap", signer: EVM_SIGNER_2, txData: { data: "0x12345678", gas: "21000", maxFeePerGas: "1000000000", maxPriorityFeePerGas: "1000000000", to: "0x000000000000000000000000000000000000dEaD", value: "0" } },
];

const VALID_EXAMPLE_PRESIGNED_TX_EUR_OFFRAMP: PresignedTx[] = [
  withBackups({
    meta: {},
    nonce: 0,
    phase: "stellarCreateAccount",
    signer: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ",
    txData: MOCK_TX_DATA_STELLAR_CREATE_ACCOUNT,
    network: Networks.Stellar
  }),
  withBackups({
    meta: {},
    nonce: 1,
    phase: "stellarPayment",
    signer: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ",
    txData: MOCK_TX_DATA_STELLAR_PAYMENT,
    network: Networks.Stellar
  }),
  withBackups({
    meta: {},
    nonce: 2,
    phase: "stellarCleanup",
    signer: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ",
    txData: MOCK_TX_DATA_STELLAR_CLEANUP,
    network: Networks.Stellar
  }),
  withBackups({
    meta: {},
    nonce: 0,
    phase: "nablaApprove",
    signer: "5GBVPRfgZYjDMqQSACxzfrPeKxnsKGyinwwGRFpcacaAzDov",
    txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_2,
    network: Networks.Pendulum
  }),
  withBackups({
    meta: {},
    nonce: 1,
    phase: "nablaSwap",
    signer: "5GBVPRfgZYjDMqQSACxzfrPeKxnsKGyinwwGRFpcacaAzDov",
    txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_2,
    network: Networks.Pendulum
  }),
  withBackups({
    meta: {},
    nonce: 2,
    phase: "spacewalkRedeem",
    signer: "5GBVPRfgZYjDMqQSACxzfrPeKxnsKGyinwwGRFpcacaAzDov",
    txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_2,
    network: Networks.Pendulum,
  }),
  withBackups({
    meta: {},
    nonce: 3,
    phase: "pendulumCleanup",
    signer: "5GBVPRfgZYjDMqQSACxzfrPeKxnsKGyinwwGRFpcacaAzDov",
    txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_2,
    network: Networks.Pendulum
  })
];

const VALID_EXAMPLE_UNSIGNED_TX_EUR_OFFRAMP: PresignedTx[] = [
  { meta: {}, network: Networks.Stellar, nonce: 0, phase: "stellarCreateAccount", signer: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ", txData: MOCK_TX_DATA_STELLAR_CREATE_ACCOUNT },
  { meta: {}, network: Networks.Stellar, nonce: 1, phase: "stellarPayment", signer: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ", txData: MOCK_TX_DATA_STELLAR_PAYMENT },
  { meta: {}, network: Networks.Stellar, nonce: 2, phase: "stellarCleanup", signer: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ", txData: MOCK_TX_DATA_STELLAR_CLEANUP },
  { meta: {}, network: Networks.Pendulum, nonce: 0, phase: "nablaApprove", signer: "5GBVPRfgZYjDMqQSACxzfrPeKxnsKGyinwwGRFpcacaAzDov", txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_2 },
  { meta: {}, network: Networks.Pendulum, nonce: 1, phase: "nablaSwap", signer: "5GBVPRfgZYjDMqQSACxzfrPeKxnsKGyinwwGRFpcacaAzDov", txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_2 },
  { meta: {}, network: Networks.Pendulum, nonce: 2, phase: "spacewalkRedeem", signer: "5GBVPRfgZYjDMqQSACxzfrPeKxnsKGyinwwGRFpcacaAzDov", txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_2 },
  { meta: {}, network: Networks.Pendulum, nonce: 3, phase: "pendulumCleanup", signer: "5GBVPRfgZYjDMqQSACxzfrPeKxnsKGyinwwGRFpcacaAzDov", txData: MOCK_TX_DATA_SUBSTRATE_SIGNER_2 },
];

describe("Presigned Transaction validation", () => {
  it("matches a signed EVM transaction to the unsigned server-built transaction", async () => {
    const unsignedTxData: EvmTransactionData = {
      data: "0x12345678",
      gas: "21000",
      maxFeePerGas: "1000000000",
      maxPriorityFeePerGas: "1000000000",
      to: "0x000000000000000000000000000000000000dEaD",
      value: "1"
    };
    const signedRawTx = await EVM_WALLET.signTransaction({
      chainId: 137,
      data: unsignedTxData.data,
      gasLimit: BigInt(unsignedTxData.gas),
      maxFeePerGas: BigInt(unsignedTxData.maxFeePerGas!),
      maxPriorityFeePerGas: BigInt(unsignedTxData.maxPriorityFeePerGas!),
      nonce: 4,
      to: unsignedTxData.to,
      type: 2,
      value: BigInt(unsignedTxData.value)
    });

    const unsignedTx: PresignedTx = {
      meta: {},
      network: Networks.Polygon,
      nonce: 4,
      phase: "fundEphemeral",
      signer: EVM_WALLET.address,
      txData: unsignedTxData
    };
    const signedTx: PresignedTx = {
      ...unsignedTx,
      txData: signedRawTx
    };

    // change to use universal "validator"
    expect(areAllTxsIncluded([signedTx], [unsignedTx])).toBe(true);
  });

  it("includes a signed EVM transaction regardless of txData calldata differences (correctness is validated elsewhere)", async () => {
    const unsignedTxData: EvmTransactionData = {
      data: "0x12345678",
      gas: "21000",
      to: "0x000000000000000000000000000000000000dEaD",
      value: "1"
    };
    const signedRawTx = await EVM_WALLET.signTransaction({
      chainId: 137,
      data: "0x87654321",
      gasLimit: 21000n,
      nonce: 4,
      to: unsignedTxData.to,
      value: 1n
    });

    const unsignedTx: PresignedTx = {
      meta: {},
      network: Networks.Polygon,
      nonce: 4,
      phase: "fundEphemeral",
      signer: EVM_WALLET.address,
      txData: unsignedTxData
    };
    const signedTx: PresignedTx = {
      ...unsignedTx,
      txData: signedRawTx
    };

    expect(areAllTxsIncluded([signedTx], [unsignedTx])).toBe(true);
  });


  it("accepts user-signed permit typed data for squidRouterPermitExecute", async () => {
    const typedData: SignedTypedData = {
      domain: {
        chainId: 137,
        name: "Token",
        verifyingContract: "0x0000000000000000000000000000000000000001",
        version: "1"
      },
      message: {
        deadline: "9999999999",
        nonce: "0",
        owner: EVM_WALLET.address,
        spender: "0x0000000000000000000000000000000000000003",
        value: "1"
      },
      primaryType: "Permit",
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      }
    };
    const signature = EthersSignature.from(await EVM_WALLET.signTypedData(typedData.domain, typedData.types, typedData.message));
    const presignedTx: PresignedTx = {
      meta: {},
      network: Networks.Polygon,
      nonce: 0,
      phase: "squidRouterPermitExecute",
      signer: EVM_WALLET.address,
      txData: [
        {
          ...typedData,
          signature: { deadline: 9999999999, r: signature.r as `0x${string}`, s: signature.s as `0x${string}`, v: signature.v }
        }
      ]
    };
    const unsignedTx: PresignedTx = {
      meta: {},
      network: Networks.Polygon,
      nonce: 0,
      phase: "squidRouterPermitExecute",
      signer: EVM_WALLET.address,
      txData: [
        {
          ...typedData,
          signature: { deadline: 9999999999, r: signature.r as `0x${string}`, s: signature.s as `0x${string}`, v: signature.v }
        }
      ]
    };

    await expect(
      validatePresignedTxs(RampDirection.SELL, [presignedTx], {
        EVM: "0x0000000000000000000000000000000000000004",
        Stellar: "",
        Substrate: ""
      }, [unsignedTx])
    ).resolves.toBeUndefined();
  });

  it("validates polymorphic phases as EVM transactions when they are on Base", async () => {
    const expectedEvmSigner = "0x1111111111111111111111111111111111111111";
    const wrongEvmSigner = "0x2222222222222222222222222222222222222222";
    const polymorphicBasePhases: PresignedTx["phase"][] = [
      "nablaApprove",
      "nablaSwap",
      "distributeFees",
      "subsidizePreSwap",
      "subsidizePostSwap"
    ];

    for (const phase of polymorphicBasePhases) {
      const unsignedTx: PresignedTx = {
        meta: {},
        network: Networks.Base,
        nonce: 0,
        phase,
        signer: expectedEvmSigner,
        txData: { data: "0x12345678", gas: "21000", maxFeePerGas: "1000000000", maxPriorityFeePerGas: "1000000000", to: "0x000000000000000000000000000000000000dEaD", value: "0" }
      };
      await expect(
        validatePresignedTxs(
          RampDirection.BUY,
          [
            {
              meta: {},
              network: Networks.Base,
              nonce: 0,
              phase,
              signer: wrongEvmSigner,
              txData: "0x"
            }
          ],
          {
            EVM: expectedEvmSigner,
            Stellar: "",
            Substrate: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz"
          },
          [unsignedTx]
        )
      ).rejects.toThrow(`EVM transaction signer ${wrongEvmSigner} does not match the expected signer ${expectedEvmSigner}`);
    }
  });

  it("should pass validation for valid presigned EVM transactions", async () => {
    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, VALID_EXAMPLE_PRESIGNED_TX_EUR_ONRAMP, ephemerals, VALID_EXAMPLE_UNSIGNED_TX_EUR_ONRAMP)).resolves.toBeUndefined();
  });

  it("should pass validation for single valid presigned transaction", async () => {
    const singleTx: PresignedTx[] = [VALID_EXAMPLE_PRESIGNED_TX_EUR_ONRAMP[0]];
    const singleUnsigned: PresignedTx[] = [VALID_EXAMPLE_UNSIGNED_TX_EUR_ONRAMP[0]];

    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, singleTx, ephemerals, singleUnsigned)).resolves.toBeUndefined();
  });

  it("should pass validation for valid presigned mixed transactions", async () => {
    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "5GBVPRfgZYjDMqQSACxzfrPeKxnsKGyinwwGRFpcacaAzDov",
      EVM: EVM_SIGNER_2,
      Stellar: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ"
    };

    await expect(validatePresignedTxs(RampDirection.SELL, VALID_EXAMPLE_PRESIGNED_TX_EUR_OFFRAMP, ephemerals, VALID_EXAMPLE_UNSIGNED_TX_EUR_OFFRAMP)).resolves.toBeUndefined();
  }, 30000);

  it("should throw for transaction with mismatch of expected signer for Substrate tx", async () => {
    const invalidTxs: PresignedTx[] = JSON.parse(JSON.stringify(VALID_EXAMPLE_PRESIGNED_TX_BRL_ONRAMP));
    const invalidSigner = "5CoKLhtjijsxVneDXeV3QhcdD4byxDK7cSmNCuWEfQ8NjebM";
    invalidTxs[0].signer = invalidSigner;
    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
      EVM: EVM_SIGNER_2,
      Stellar: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ"
    };
    await expect(validatePresignedTxs(RampDirection.BUY, invalidTxs, ephemerals, VALID_EXAMPLE_UNSIGNED_TX_BRL_ONRAMP)).rejects.toThrow(
      `Substrate transaction signer ${invalidSigner} does not match the expected signer 5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz for phase nablaApprove`
    );
  });

  it("should throw for transaction with mismatch of expected signer for EVM tx", async () => {
    const wrongSigner = "0x1983259996E1908f24b56f426F08703C9Db8028B";
    const presignedTx: PresignedTx = await makeSignedEvmTx({
      nonce: 5,
      phase: "fundEphemeral",
      network: Networks.Polygon,
      signer: wrongSigner
    });
    const unsignedTx: PresignedTx = {
      meta: {},
      network: Networks.Polygon,
      nonce: 5,
      phase: "fundEphemeral",
      signer: EVM_SIGNER,
      txData: { data: "0x12345678", gas: "21000", maxFeePerGas: "1000000000", maxPriorityFeePerGas: "1000000000", to: "0x000000000000000000000000000000000000dEaD", value: "0" }
    };

    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, [presignedTx], ephemerals, [unsignedTx])).rejects.toThrow(
      `EVM transaction signer ${wrongSigner} does not match the expected signer ${EVM_SIGNER}`
    );
  });

  it("should throw for transaction with mismatch of expected signer for Stellar tx", async () => {
    const invalidTxs: PresignedTx[] = JSON.parse(JSON.stringify(VALID_EXAMPLE_PRESIGNED_TX_EUR_OFFRAMP));
    const invalidSigner = "GCFX5YV7Y5LF2XK3S5Y4L5XW4D5Z6A7B8C9D0E1F2G3H4I5J6K7L8M9N0O1P2Q3R4S5T6U7V8W9X0Y1Z2";
    invalidTxs[0].signer = invalidSigner;
    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
      EVM: EVM_SIGNER_2,
      Stellar: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ"
    };
    await expect(validatePresignedTxs(RampDirection.SELL, invalidTxs, ephemerals, VALID_EXAMPLE_UNSIGNED_TX_EUR_OFFRAMP)).rejects.toThrow(
      `Stellar transaction signer ${invalidSigner} does not match the expected signer GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ for phase stellarCreateAccount.`
    );
  });

  it("should throw error for invalid presigned transactions array", async () => {
    const invalidTxs: any = "invalid data";
    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
      EVM: EVM_SIGNER_2,
      Stellar: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ"
    };
    await expect(validatePresignedTxs(RampDirection.BUY, invalidTxs, ephemerals, [])).rejects.toThrow("presignedTxs must be an array with 1-100 elements");
  });

  it("should throw error for too many transactions", async () => {
    const invalidTxs: PresignedTx[] = new Array(101).fill(VALID_EXAMPLE_PRESIGNED_TX_EUR_ONRAMP[0]);
    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
      EVM: EVM_SIGNER_2,
      Stellar: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ"
    };
    await expect(validatePresignedTxs(RampDirection.BUY, invalidTxs, ephemerals, [])).rejects.toThrow("presignedTxs must be an array with 1-100 elements");
  });

  it("should throw when an ephemeral transaction is missing backup transactions", async () => {
    const invalidTxs: PresignedTx[] = JSON.parse(JSON.stringify(VALID_EXAMPLE_PRESIGNED_TX_EUR_ONRAMP));
    invalidTxs[2].meta = {};

    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, invalidTxs, ephemerals, VALID_EXAMPLE_UNSIGNED_TX_EUR_ONRAMP)).rejects.toThrow(
      "Transaction for phase squidRouterSwap must include at least 4 backup transactions in meta.additionalTxs"
    );
  });

  it("should throw when backup transaction nonces are not sequential", async () => {
    const invalidTxs: PresignedTx[] = JSON.parse(JSON.stringify(VALID_EXAMPLE_PRESIGNED_TX_EUR_ONRAMP));
    const backupTx = invalidTxs[2]?.meta?.additionalTxs?.backup2;
    if (!backupTx) {
      throw new Error("Missing backup transaction for test setup");
    }
    backupTx.nonce = 9;

    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, invalidTxs, ephemerals, VALID_EXAMPLE_UNSIGNED_TX_EUR_ONRAMP)).rejects.toThrow(
      "Transaction for phase squidRouterSwap has invalid backup nonce sequence. Expected 4, got 5"
    );
  });

  it("validates signed EVM hex blob recovers the correct signer", async () => {
    const presignedTx: PresignedTx = await makeSignedEvmTxWithBackups({
      nonce: 5,
      phase: "fundEphemeral",
      network: Networks.Polygon
    });
    const unsignedTx: PresignedTx = {
      meta: {},
      network: Networks.Polygon,
      nonce: 5,
      phase: "fundEphemeral",
      signer: EVM_SIGNER,
      txData: { data: "0x12345678", gas: "21000", maxFeePerGas: "1000000000", maxPriorityFeePerGas: "1000000000", to: "0x000000000000000000000000000000000000dEaD", value: "0" }
    };

    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, [presignedTx], ephemerals, [unsignedTx])).resolves.toBeUndefined();
  });

  it("rejects signed EVM hex blob with wrong signer", async () => {
    const wrongSigner = "0x2222222222222222222222222222222222222222";
    const presignedTx: PresignedTx = await makeSignedEvmTx({
      nonce: 5,
      phase: "fundEphemeral",
      network: Networks.Polygon,
      signer: wrongSigner
    });
    const unsignedTx: PresignedTx = {
      meta: {},
      network: Networks.Polygon,
      nonce: 5,
      phase: "fundEphemeral",
      signer: wrongSigner,
      txData: { data: "0x12345678", gas: "21000", maxFeePerGas: "1000000000", maxPriorityFeePerGas: "1000000000", to: "0x000000000000000000000000000000000000dEaD", value: "0" }
    };

    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: wrongSigner,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, [presignedTx], ephemerals, [unsignedTx])).rejects.toThrow(
      "Recovered signer"
    );
  });

  it("rejects signed EVM hex blob with wrong nonce", async () => {
    const presignedTx: PresignedTx = await makeSignedEvmTx({
      nonce: 5,
      phase: "fundEphemeral",
      network: Networks.Polygon
    });
    const unsignedTx: PresignedTx = {
      meta: {},
      network: Networks.Polygon,
      nonce: 5,
      phase: "fundEphemeral",
      signer: EVM_SIGNER,
      txData: { data: "0x12345678", gas: "21000", maxFeePerGas: "1000000000", maxPriorityFeePerGas: "1000000000", to: "0x000000000000000000000000000000000000dEaD", value: "0" }
    };

    const presignedTxWithWrongNonce: PresignedTx = { ...presignedTx, nonce: 99 };

    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, [presignedTxWithWrongNonce], ephemerals, [unsignedTx])).rejects.toThrow(
      "does not match expected nonce"
    );
  });

  it("rejects signed EVM hex blob with wrong signed nonce", async () => {
    const presignedTxWithWrongNonce: PresignedTx = withBackups(await makeSignedEvmTx({
      nonce: 99,
      phase: "fundEphemeral",
      network: Networks.Polygon
    }));
    const unsignedTx: PresignedTx = {
      meta: {},
      network: Networks.Polygon,
      nonce: 99,
      phase: "fundEphemeral",
      signer: EVM_SIGNER,
      txData: { data: "0x12345678", gas: "21000", maxFeePerGas: "1000000000", maxPriorityFeePerGas: "1000000000", to: "0x000000000000000000000000000000000000dEaD", value: "0" }
    };

    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, [presignedTxWithWrongNonce], ephemerals, [unsignedTx])).rejects.toThrow(
      "does not match expected nonce"
    );
  });


  it("rejects signed EVM hex blob with wrong chainId", async () => {
    const presignedTx: PresignedTx = await makeSignedEvmTx({
      nonce: 5,
      phase: "fundEphemeral",
      network: Networks.Polygon,
      chainId: 1
    });
    const unsignedTx: PresignedTx = {
      meta: {},
      network: Networks.Polygon,
      nonce: 5,
      phase: "fundEphemeral",
      signer: EVM_SIGNER,
      txData: { data: "0x12345678", gas: "21000", maxFeePerGas: "1000000000", maxPriorityFeePerGas: "1000000000", to: "0x000000000000000000000000000000000000dEaD", value: "0" }
    };

    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, [presignedTx], ephemerals, [unsignedTx])).rejects.toThrow(
      "does not match expected network ID"
    );
  });

  it("rejects signed EVM hex blob when txData does not match unsigned object value", async () => {
    const unsignedTxData: EvmTransactionData = {
      data: "0x12345678",
      gas: "21000",
      maxFeePerGas: "1000000000",
      maxPriorityFeePerGas: "1000000000",
      to: "0x000000000000000000000000000000000000dEaD",
      value: "100"
    };
    const unsignedTx: PresignedTx = {
      meta: {},
      network: Networks.Polygon,
      nonce: 5,
      phase: "fundEphemeral",
      signer: EVM_SIGNER,
      txData: unsignedTxData
    };

    const signedRawTx = await EVM_WALLET.signTransaction({
      chainId: 137,
      data: unsignedTxData.data,
      gasLimit: BigInt(unsignedTxData.gas),
      maxFeePerGas: BigInt("1000000000"),
      maxPriorityFeePerGas: BigInt("1000000000"),
      nonce: 5,
      to: unsignedTxData.to,
      type: 2,
      value: 500n
    });

    const presignedTx: PresignedTx = {
      ...unsignedTx,
      txData: signedRawTx
    };

    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, [presignedTx], ephemerals, [unsignedTx])).rejects.toThrow(
      "Signed EVM transaction value"
    );
  });

  it("rejects signed EVM hex blob when txData does not match unsigned object raw data", async () => {
    const unsignedTxData: EvmTransactionData = {
      data: "0x12345678",
      gas: "21000",
      maxFeePerGas: "1000000000",
      maxPriorityFeePerGas: "1000000000",
      to: "0x000000000000000000000000000000000000dEaD",
      value: "100"
    };
    const unsignedTx: PresignedTx = {
      meta: {},
      network: Networks.Polygon,
      nonce: 5,
      phase: "fundEphemeral",
      signer: EVM_SIGNER,
      txData: unsignedTxData
    };

    const signedRawTx = await EVM_WALLET.signTransaction({
      chainId: 137,
      data: unsignedTxData.data + "00", // change data to cause mismatch
      gasLimit: BigInt(unsignedTxData.gas),
      maxFeePerGas: BigInt("1000000000"),
      maxPriorityFeePerGas: BigInt("1000000000"),
      nonce: 5,
      to: unsignedTxData.to,
      type: 2,
      value: "100"
    });

    const presignedTx: PresignedTx = {
      ...unsignedTx,
      txData: signedRawTx
    };

    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, [presignedTx], ephemerals, [unsignedTx])).rejects.toThrow(
      "Signed EVM transaction data"
    );
  });

  it("should throw error when transaction is missing required properties", async () => {
    const invalidTx: any = { network: Networks.Polygon, nonce: 0, signer: EVM_SIGNER, txData: "0x" }; // missing phase
    const ephemerals: { [key in EphemeralAccountType]: string } = { Substrate: "", EVM: EVM_SIGNER, Stellar: "" };
    await expect(validatePresignedTxs(RampDirection.BUY, [invalidTx], ephemerals, [])).rejects.toThrow("Each transaction must have txData, phase, network, nonce and signer properties");
  });

  it("skips validation for moneriumOnrampMint phase", async () => {
    const tx: PresignedTx = { meta: {}, network: Networks.Polygon, nonce: 0, phase: "moneriumOnrampMint", signer: EVM_SIGNER, txData: "invalid data" };
    const ephemerals: { [key in EphemeralAccountType]: string } = { Substrate: "", EVM: EVM_SIGNER_2, Stellar: "" };
    const unsignedTx = { ...tx };
    await expect(validatePresignedTxs(RampDirection.BUY, [tx], ephemerals, [unsignedTx])).resolves.toBeUndefined();
  });

  it("skips validation for user-submitted wallet phases like squidRouterNoPermitTransfer", async () => {
    const tx: PresignedTx = { meta: {}, network: Networks.Polygon, nonce: 0, phase: "squidRouterNoPermitTransfer", signer: EVM_SIGNER, txData: "invalid data" };
    const ephemerals: { [key in EphemeralAccountType]: string } = { Substrate: "", EVM: EVM_SIGNER_2, Stellar: "" };
    const unsignedTx = { ...tx };
    await expect(validatePresignedTxs(RampDirection.BUY, [tx], ephemerals, [unsignedTx])).resolves.toBeUndefined();
  });

  it("skips validation for squidRouterSwap when direction is SELL", async () => {
    const tx: PresignedTx = { meta: {}, network: Networks.Polygon, nonce: 0, phase: "squidRouterSwap", signer: EVM_SIGNER, txData: "invalid data" };
    const ephemerals: { [key in EphemeralAccountType]: string } = { Substrate: "", EVM: EVM_SIGNER_2, Stellar: "" };
    const unsignedTx = { ...tx };
    await expect(validatePresignedTxs(RampDirection.SELL, [tx], ephemerals, [unsignedTx])).resolves.toBeUndefined();
  });

  it("should throw when an ephemeral transaction is missing from presignedTxs", async () => {
    const ephemerals: { [key in EphemeralAccountType]: string } = { Substrate: "", EVM: EVM_SIGNER, Stellar: "" };
    const unsignedTx: PresignedTx = { meta: {}, network: Networks.Polygon, nonce: 0, phase: "fundEphemeral", signer: EVM_SIGNER, txData: { data: "0x12345678", gas: "21000", maxFeePerGas: "1000000000", maxPriorityFeePerGas: "1000000000", to: "0x000000000000000000000000000000000000dEaD", value: "0" } };
    const userTx: PresignedTx = { meta: {}, network: Networks.Polygon, nonce: 0, phase: "moneriumOnrampMint", signer: EVM_SIGNER_2, txData: "invalid" };
    await expect(validatePresignedTxs(RampDirection.BUY, [userTx], ephemerals, [unsignedTx, userTx])).rejects.toThrow("Not all unsigned transactions have a corresponding presigned transaction");
  });

  it("should throw when there is an extra presigned transaction not in unsignedTxs", async () => {
    const ephemerals: { [key in EphemeralAccountType]: string } = { Substrate: "", EVM: EVM_SIGNER, Stellar: "" };
    const tx: PresignedTx = await makeSignedEvmTxWithBackups({ nonce: 0, phase: "fundEphemeral", network: Networks.Polygon });
    await expect(validatePresignedTxs(RampDirection.BUY, [tx], ephemerals, [])).rejects.toThrow("Some presigned transactions do not match any unsigned transaction");
  });

  it("should throw for an unknown phase", async () => {
    const tx: PresignedTx = { meta: {}, network: Networks.Polygon, nonce: 0, phase: "unknownPhase" as any, signer: EVM_SIGNER, txData: "0x" };
    const ephemerals: { [key in EphemeralAccountType]: string } = { Substrate: "", EVM: EVM_SIGNER, Stellar: "" };
    await expect(validatePresignedTxs(RampDirection.BUY, [tx], ephemerals, [tx])).rejects.toThrow('Unknown phase "unknownPhase" — cannot determine transaction type');
  });

  it("should throw if typed data signature is an array", async () => {
    const typedData: SignedTypedData = {
      domain: { chainId: 137, name: "Token", verifyingContract: "0x0000000000000000000000000000000000000001", version: "1" },
      message: { deadline: "9999999999", nonce: "0", owner: EVM_WALLET.address, spender: "0x0000000000000000000000000000000000000003", value: "1" },
      primaryType: "Permit",
      types: { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
      signature: [] as any // Array signature
    };
    const presignedTx: PresignedTx = { meta: {}, network: Networks.Polygon, nonce: 0, phase: "squidRouterPermitExecute", signer: EVM_WALLET.address, txData: [typedData] };
    const ephemerals: { [key in EphemeralAccountType]: string } = { Substrate: "", EVM: EVM_SIGNER_2, Stellar: "" };
    await expect(validatePresignedTxs(RampDirection.SELL, [presignedTx], ephemerals, [presignedTx])).rejects.toThrow("must include exactly one signature");
  });

  it("rejects when one of the backup transactions signs an invalid data blob", async () => {
    const unsignedTxData: EvmTransactionData = {
      data: "0x12345678",
      gas: "21000",
      maxFeePerGas: "1000000000",
      maxPriorityFeePerGas: "1000000000",
      to: "0x000000000000000000000000000000000000dEaD",
      value: "0"
    };

    const unsignedTx: PresignedTx = {
      meta: {},
      network: Networks.Polygon,
      nonce: 5,
      phase: "fundEphemeral",
      signer: EVM_SIGNER,
      txData: unsignedTxData
    };

    const presignedTx = await makeSignedEvmTxWithBackups({
      nonce: 5,
      phase: "fundEphemeral",
      network: Networks.Polygon,
      data: unsignedTxData.data
    });

    // Tamper with backup2 to have invalid data
    const maliciousBackup = await EVM_WALLET.signTransaction({
      chainId: 137,
      data: "0x99999999", // Invalid data!
      gasLimit: BigInt(unsignedTxData.gas),
      maxFeePerGas: BigInt(unsignedTxData.maxFeePerGas!),
      maxPriorityFeePerGas: BigInt(unsignedTxData.maxPriorityFeePerGas!),
      nonce: 5 + 2,
      to: unsignedTxData.to,
      type: 2,
      value: BigInt(unsignedTxData.value!)
    });

    presignedTx.meta!.additionalTxs!.backup2.txData = maliciousBackup;

    const ephemerals: { [key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, [presignedTx], ephemerals, [unsignedTx])).rejects.toThrow(
      "Signed EVM transaction data does not match expected data"
    );
  });
});
