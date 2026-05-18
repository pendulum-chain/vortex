import {describe, expect, it} from "bun:test";
import { Signature as EthersSignature, Wallet } from "ethers";
import {EphemeralAccountType, Networks, PresignedTx, RampDirection, SignedTypedData, EvmTransactionData} from "@vortexfi/shared";
import {areAllTxsIncluded, validatePresignedTxs} from "./validation";
import { NUMBER_OF_PRESIGNED_TXS } from "@vortexfi/shared";

const EVM_WALLET = new Wallet("0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
const EVM_SIGNER = EVM_WALLET.address;
const EVM_SIGNER_2 = "0x876452cC7a2280560d39e7E8aEBc9d1bAAbd4fEa";

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

const VALID_EXAMPLE_PRESIGNED_TX_BRL_ONRAMP: PresignedTx[] = [
  withBackups({
    meta: {},
    nonce: 0,
    phase: "nablaApprove",
    signer: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
    txData: "0x71038400ac1767af9bf4282c0f268b5ce1797db8f19eaf9a748f2d9519905654b9c292370162bd23e90ef57a53ec3360bba0b3c1a735dfa22251bd5800105241d94006cd2f9484ba4494f57fb6b00aba9fb6b8a11effb73a22fda6223eb4abe5169ab30d880000000038060093dfde426795690be15b2071741d6538cd265eb673a9e9a1ae4e4389fda96a620007cdd55d7302ce800200001101095ea7b3e0a5f34199e165cbd3f9b0eba1f5e15d5018a7ffe8b76a3693ba5b317efb09d800005dccfd995e80000000000000000000000000000000000000000000000000",
    network: Networks.Pendulum
  }),
  withBackups({
    meta: {},
    nonce: 1,
    phase: "nablaSwap",
    signer: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
    txData: "0x75058400ac1767af9bf4282c0f268b5ce1797db8f19eaf9a748f2d9519905654b9c292370158d8c585d9a217389d99709447f8f5777781b979de8eebc194b7dbb7bfd22344b1914b97d2527d0eabf1bb4a68739e6a4d0766ed783f2541ec46fbec5a62d38f00040000380600e0a5f34199e165cbd3f9b0eba1f5e15d5018a7ffe8b76a3693ba5b317efb09d80007003a9a535082584f0000150338ed173900005dccfd995e8000000000000000000000000000000000000000000000000016d21800000000000000000000000000000000000000000000000000000000000893dfde426795690be15b2071741d6538cd265eb673a9e9a1ae4e4389fda96a6290573e0b663336bc844ddd1293af95b0b1872f2677f93e11cc658fafddc58db9ac1767af9bf4282c0f268b5ce1797db8f19eaf9a748f2d9519905654b9c292375883036900000000000000000000000000000000000000000000000000000000",
    network: Networks.Pendulum
  }),
  withBackups({
    meta: {},
    nonce: 2,
    phase: "distributeFees",
    signer: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
    txData: "0x4d028400ac1767af9bf4282c0f268b5ce1797db8f19eaf9a748f2d9519905654b9c2923701bc556326e0a028968b7e79fdc2ca473c8ab25f1118c02cd438c5b6ce9eac9b7056ba09c15c7c93455b10e17f5234c61dd13e3562a74012f1b65a7f8d5dbc298300080000330204350200a2b2a8753c39705138998ee3285ab982e1d4f87ff90e626d46938b3e995e2cbd010c4a0c0400",
    network: Networks.Pendulum
  }),
  withBackups({
    meta: {},
    nonce: 3,
    phase: "pendulumToMoonbeamXcm",
    signer: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
    txData: "0xbd028400ac1767af9bf4282c0f268b5ce1797db8f19eaf9a748f2d9519905654b9c292370122251f038f2b4eaebdcc58e59b539624cdbc8704d8d07fc9af0f799b8336515d595ec3de29f488c64b07212868acd68bb0a039e0fffbf4c2e8abd72d188cf687000c0000360408010cb61c190000000000000000000000000001060000c52ebca2b10000000000000000000100000003010200511f0300876452cc7a2280560d39e7e8aebc9d1baabd4fea00",
    network: Networks.Pendulum
  }),
  withBackups({
    meta: {},
    nonce: 4,
    phase: "pendulumCleanup",
    signer: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
    txData: "0x69038400ac1767af9bf4282c0f268b5ce1797db8f19eaf9a748f2d9519905654b9c2923701e657e664e59ebdc9eac968d4377c7c98465c67eeed99a2b17c3c5009b457d43568e763954af6bed513f25f08be04aeaea98d6edde2cf8640eb2d931a5fe0578f0010000033020c35010056d9583bf0369fff4a35d997b2b5f5997843311823b1aa88fe9661874984e647010d0035010056d9583bf0369fff4a35d997b2b5f5997843311823b1aa88fe9661874984e647010c000a040056d9583bf0369fff4a35d997b2b5f5997843311823b1aa88fe9661874984e64700",
    network: Networks.Pendulum
  }),
  await makeSignedEvmTxWithBackups({ nonce: 0, phase: "moonbeamToPendulumXcm", network: Networks.Moonbeam, signer: EVM_SIGNER_2, chainId: 1284 }),
  await makeSignedEvmTxWithBackups({ nonce: 4, phase: "moonbeamCleanup", network: Networks.Moonbeam, signer: EVM_SIGNER_2, chainId: 1284 }),
  await makeSignedEvmTxWithBackups({ nonce: 2, phase: "squidRouterApprove", network: Networks.Moonbeam, signer: EVM_SIGNER_2, chainId: 1284 }),
  await makeSignedEvmTxWithBackups({ nonce: 3, phase: "squidRouterSwap", network: Networks.Moonbeam, signer: EVM_SIGNER_2, chainId: 1284 }),
];

const VALID_EXAMPLE_PRESIGNED_TX_EUR_OFFRAMP: PresignedTx[] = [
  withBackups({
    meta: {},
    nonce: 0,
    phase: "stellarCreateAccount",
    signer: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ",
    txData: "AAAAAgAAAADkOCw1GPsc4U0bNLBfqRtbB05ZcogqYJfDKZYB95sHRAAtxsADWqM3AAAArQAAAAIAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAABb98/OGp4OrOMF58ADgwMHgBEvumr4FGRDfL2ZggooKAAAAAABfXhAAAAAAQAAAABb98/OGp4OrOMF58ADgwMHgBEvumr4FGRDfL2ZggooKAAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAIAAAABAAAAAgAAAAEAAAACAAAAAAAAAAEAAAAA5DgsNRj7HOFNGzSwX6kbWwdOWXKIKmCXwymWAfebB0QAAAABAAAAAQAAAABb98/OGp4OrOMF58ADgwMHgBEvumr4FGRDfL2ZggooKAAAAAYAAAABRVVSQwAAAADPT1om4gkLs63PAsep1z2/5mWcxpBGFHW4ZDf6SccRNn//////////AAAAAAAAAAL3mwdEAAAAQCsExvxklazpsIDVJtyQU8Ou969v8j1NeM/MDMATo0UlUifWtbb218kd+ql6i21PQbD7ibxm6M4Zp1zflDIRMwOCCigoAAAAQF1MLyxdcdQ9lMYiR8iHye4TIKoP9zOimi4AKCL87rgDeXbEazuVR0GS0ILjnsc3NLFySKtAWcUFX20XXp7v5Aw=",
    network: Networks.Stellar
  }),
  withBackups({
    meta: {},
    nonce: 1,
    phase: "stellarPayment",
    signer: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ",
    txData: "AAAAAgAAAABb98/OGp4OrOMF58ADgwMHgBEvumr4FGRDfL2ZggooKAAPQkADjNQFAAAAAQAAAAIAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAA1NWUsxNzYxNDkyNzc2AAAAAAAAAQAAAAAAAAABAAAAAMwmH81TyAdqCkge7nLAJdasnz/JchoiBMyDM9Io97NEAAAAAUVVUkMAAAAAz09aJuIJC7OtzwLHqdc9v+ZlnMaQRhR1uGQ3+knHETYAAAAABh8T4AAAAAAAAAAC95sHRAAAAEB4aZkEhfZ98f+FbQSEj0wFNirD7fe2HiWLM9jIuvkoQ9ruzSxycCK+NMiIgppZnNSNnibw10BseXsG9kjK1u0KggooKAAAAED8tHWEfIKPzeuHVBnMy9x+ireQ6kepvWCLq/ZRyXWN8m+lcE0r60HwjD25xJovaY9hyVh9X50o/xm0dM6DlIsF",
    network: Networks.Stellar
  }),
  withBackups({
    meta: {},
    nonce: 2,
    phase: "stellarCleanup",
    signer: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ",
    txData: "AAAAAgAAAABb98/OGp4OrOMF58ADgwMHgBEvumr4FGRDfL2ZggooKAAehIADjNQFAAAAAgAAAAIAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAABgAAAAFFVVJDAAAAAM9PWibiCQuzrc8Cx6nXPb/mZZzGkEYUdbhkN/pJxxE2AAAAAAAAAAAAAAAAAAAACAAAAADkOCw1GPsc4U0bNLBfqRtbB05ZcogqYJfDKZYB95sHRAAAAAAAAAAC95sHRAAAAEB8+udS9KiWj8JjxxPB3HSMC0EkRvggU2hOP9IoHF8+T7VzqZiPzzwuothCSKwaOgaVvG/SSPUIKJQkpVYhjqwJggooKAAAAECSKoTeRu3ttJ9G3Cj6a79Yv6ZQTguCIlGo2tlJltKvQex7SQys69T93BeoG+XALB8I8MvSiQoEXE7unZYpmL0A",
    network: Networks.Stellar
  }),
  withBackups({
    meta: {},
    nonce: 0,
    phase: "nablaApprove",
    signer: "5GBVPRfgZYjDMqQSACxzfrPeKxnsKGyinwwGRFpcacaAzDov",
    txData: "0x71038400b61dacc574163a9e8da2aca2b29090c610e61b21de9adbafb699156b6b6d9465019c7a2a23097caa54fcdd14432c731bd7c7c82a5648ee6d9a12378af3e241b435f2675ee515c50edfdf9098318c8a31abcc511d52a76133ad9e6b35cf5209bb8d000000003806005c1026460683b902672db0bbf65df0c021f5c9f844663e4dd1fcb13935ac6ba600072a494093029e820200001101095ea7b3e0a5f34199e165cbd3f9b0eba1f5e15d5018a7ffe8b76a3693ba5b317efb09d8e0ccb60000000000000000000000000000000000000000000000000000000000",
    network: Networks.Pendulum
  }),
  withBackups({
    meta: {},
    nonce: 1,
    phase: "nablaSwap",
    signer: "5GBVPRfgZYjDMqQSACxzfrPeKxnsKGyinwwGRFpcacaAzDov",
    txData: "0x75058400b61dacc574163a9e8da2aca2b29090c610e61b21de9adbafb699156b6b6d946501563086b97dda162ab053773820a71edb2bb21e5715eaa961b293e04eaa8a9762e9a43194f41b6ee69728dd47024155045ab556a0de92b1bde305c142a9f1a48100040000380600e0a5f34199e165cbd3f9b0eba1f5e15d5018a7ffe8b76a3693ba5b317efb09d80007003a9a535082584f0000150338ed1739e0ccb60000000000000000000000000000000000000000000000000000000000502ee5a6df080000000000000000000000000000000000000000000000000000085c1026460683b902672db0bbf65df0c021f5c9f844663e4dd1fcb13935ac6ba691527bbc28ccc6504c707183ed37ace959618cc2d7311afc7fe368060fd31181b61dacc574163a9e8da2aca2b29090c610e61b21de9adbafb699156b6b6d9465b479076900000000000000000000000000000000000000000000000000000000",
    network: Networks.Pendulum
  }),
  withBackups({
    meta: {},
    nonce: 2,
    phase: "spacewalkRedeem",
    signer: "5GBVPRfgZYjDMqQSACxzfrPeKxnsKGyinwwGRFpcacaAzDov",
    txData: "0x61038400b61dacc574163a9e8da2aca2b29090c610e61b21de9adbafb699156b6b6d946501a8f6a94c137102b940a122e2e57ddcc0fe3bd87ebb6e0973c544ec8f4c3f1870557147cc1d2947e5057d345059d4d36bb7a3c84ca133e9e9fbf04b83c883ea810008000041000b00acb32b57095bf7cfce1a9e0eace305e7c00383030780112fba6af81464437cbd99820a282872ad10a7827be5155531de3c5e805c5f640fd335b491701ac2f4ed6aedbf7961010a020145555243cf4f5a26e2090bb3adcf02c7a9d73dbfe6659cc690461475b86437fa49c71136",
    network: Networks.Pendulum,
  }),
  withBackups({
    meta: {},
    nonce: 3,
    phase: "pendulumCleanup",
    signer: "5GBVPRfgZYjDMqQSACxzfrPeKxnsKGyinwwGRFpcacaAzDov",
    txData: "0xf9038400b61dacc574163a9e8da2aca2b29090c610e61b21de9adbafb699156b6b6d94650118426ae3182f3d5fd4d5c023fd9f51b8500d474c5d72222a41cb83bf1c69a25c9bdd8e63ce4a13af23ef0a05c9d3c55ac679c82a9fa38981f7b89352e1eb6089000c000033020c35010056d9583bf0369fff4a35d997b2b5f5997843311823b1aa88fe9661874984e64701020035010056d9583bf0369fff4a35d997b2b5f5997843311823b1aa88fe9661874984e647020145555243cf4f5a26e2090bb3adcf02c7a9d73dbfe6659cc690461475b86437fa49c71136000a040056d9583bf0369fff4a35d997b2b5f5997843311823b1aa88fe9661874984e64700",
    network: Networks.Pendulum
  })
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

    expect(areAllTxsIncluded([signedTx], [unsignedTx])).toBe(true);
  });

  it("rejects a signed EVM transaction whose calldata differs from the unsigned transaction", async () => {
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

    expect(areAllTxsIncluded([signedTx], [unsignedTx])).toBe(false);
  });

  it("matches signed typed data to the unsigned typed data while ignoring signatures", () => {
    const unsignedTypedData: SignedTypedData = {
      domain: {
        chainId: 137,
        name: "Token",
        verifyingContract: "0x0000000000000000000000000000000000000001",
        version: "1"
      },
      message: {
        owner: "0x0000000000000000000000000000000000000002",
        spender: "0x0000000000000000000000000000000000000003",
        value: "1"
      },
      primaryType: "Permit",
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" }
        ]
      }
    };
    const unsignedTx: PresignedTx = {
      meta: {},
      network: Networks.Polygon,
      nonce: 0,
      phase: "squidRouterPermitExecute",
      signer: "0x0000000000000000000000000000000000000002",
      txData: [unsignedTypedData]
    };
    const signedTx: PresignedTx = {
      ...unsignedTx,
      txData: [{ ...unsignedTypedData, signature: { deadline: 9999999999, r: "0x1", s: "0x2", v: 27 } }]
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

    await expect(
      validatePresignedTxs(RampDirection.SELL, [presignedTx], {
        EVM: "0x0000000000000000000000000000000000000004",
        Stellar: "",
        Substrate: ""
      })
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
          }
        )
      ).rejects.toThrow(`EVM transaction signer ${wrongEvmSigner} does not match the expected signer ${expectedEvmSigner}`);
    }
  });

  it("should pass validation for valid presigned EVM transactions", async () => {
    const ephemerals: {[key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, VALID_EXAMPLE_PRESIGNED_TX_EUR_ONRAMP, ephemerals)).resolves.toBeUndefined();
  });

  it("should pass validation for single valid presigned transaction", async () => {
    const singleTx: PresignedTx[] = [VALID_EXAMPLE_PRESIGNED_TX_EUR_ONRAMP[0]];

    const ephemerals: {[key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, singleTx, ephemerals)).resolves.toBeUndefined();
  });

  it("should pass validation for valid presigned mixed transactions", async () => {
    const ephemerals: {[key in EphemeralAccountType]: string } = {
      Substrate: "5GBVPRfgZYjDMqQSACxzfrPeKxnsKGyinwwGRFpcacaAzDov",
      EVM: EVM_SIGNER_2,
      Stellar: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ"
    };

    await expect(validatePresignedTxs(RampDirection.SELL, VALID_EXAMPLE_PRESIGNED_TX_EUR_OFFRAMP, ephemerals)).resolves.toBeUndefined();
  });

  it("should throw for transaction with mismatch of expected signer for Substrate tx", async () => {
    const invalidTxs: PresignedTx[] = JSON.parse(JSON.stringify(VALID_EXAMPLE_PRESIGNED_TX_BRL_ONRAMP));
    const invalidSigner = "5CoKLhtjijsxVneDXeV3QhcdD4byxDK7cSmNCuWEfQ8NjebM";
    invalidTxs[0].signer = invalidSigner;
    const ephemerals: {[key in EphemeralAccountType]: string } = {
      Substrate: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
      EVM: EVM_SIGNER_2,
      Stellar: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ"
    };
    await expect(validatePresignedTxs(RampDirection.BUY, invalidTxs, ephemerals)).rejects.toThrow(
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

    const ephemerals: {[key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, [presignedTx], ephemerals)).rejects.toThrow(
      `EVM transaction signer ${wrongSigner} does not match the expected signer ${EVM_SIGNER}`
    );
  });

  it("should throw for transaction with mismatch of expected signer for Stellar tx", async () => {
    const invalidTxs: PresignedTx[] = JSON.parse(JSON.stringify(VALID_EXAMPLE_PRESIGNED_TX_EUR_OFFRAMP));
    const invalidSigner = "GCFX5YV7Y5LF2XK3S5Y4L5XW4D5Z6A7B8C9D0E1F2G3H4I5J6K7L8M9N0O1P2Q3R4S5T6U7V8W9X0Y1Z2";
    invalidTxs[0].signer = invalidSigner;
    const ephemerals: {[key in EphemeralAccountType]: string } = {
      Substrate: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
      EVM: EVM_SIGNER_2,
      Stellar: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ"
    };
    await expect(validatePresignedTxs(RampDirection.SELL, invalidTxs, ephemerals)).rejects.toThrow(
      `Stellar transaction signer ${invalidSigner} does not match the expected signer GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ for phase stellarCreateAccount.`
    );
  });

  it("should throw error for invalid presigned transactions array", async () => {
    const invalidTxs: any = "invalid data";
    const ephemerals: {[key in EphemeralAccountType]: string } = {
      Substrate: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
      EVM: EVM_SIGNER_2,
      Stellar: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ"
    };
    await expect(validatePresignedTxs(RampDirection.BUY, invalidTxs, ephemerals)).rejects.toThrow("presignedTxs must be an array with 1-100 elements");
  });

  it("should throw error for too many transactions", async () => {
    const invalidTxs: PresignedTx[] = new Array(101).fill(VALID_EXAMPLE_PRESIGNED_TX_EUR_ONRAMP[0]);
    const ephemerals: {[key in EphemeralAccountType]: string } = {
      Substrate: "5FxM3dFCnXJXEbMozuVbhEUQuQK1gmquFpUJ577HebqBc7pz",
      EVM: EVM_SIGNER_2,
      Stellar: "GBN7PT6ODKPA5LHDAXT4AA4DAMDYAEJPXJVPQFDEIN6L3GMCBIUCQSAJ"
    };
    await expect(validatePresignedTxs(RampDirection.BUY, invalidTxs, ephemerals)).rejects.toThrow("presignedTxs must be an array with 1-100 elements");
  });

  it("should throw when an ephemeral transaction is missing backup transactions", async () => {
    const invalidTxs: PresignedTx[] = JSON.parse(JSON.stringify(VALID_EXAMPLE_PRESIGNED_TX_EUR_ONRAMP));
    invalidTxs[2].meta = {};

    const ephemerals: {[key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, invalidTxs, ephemerals)).rejects.toThrow(
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

    const ephemerals: {[key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, invalidTxs, ephemerals)).rejects.toThrow(
      "Transaction for phase squidRouterSwap has invalid backup nonce sequence. Expected 4, got 5"
    );
  });

  it("validates signed EVM hex blob recovers the correct signer", async () => {
    const presignedTx: PresignedTx = await makeSignedEvmTxWithBackups({
      nonce: 5,
      phase: "fundEphemeral",
      network: Networks.Polygon
    });

    const ephemerals: {[key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, [presignedTx], ephemerals)).resolves.toBeUndefined();
  });

  it("rejects signed EVM hex blob with wrong signer", async () => {
    const wrongSigner = "0x2222222222222222222222222222222222222222";
    const presignedTx: PresignedTx = await makeSignedEvmTx({
      nonce: 5,
      phase: "fundEphemeral",
      network: Networks.Polygon,
      signer: wrongSigner
    });

    const ephemerals: {[key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: wrongSigner,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, [presignedTx], ephemerals)).rejects.toThrow(
      "Recovered signer"
    );
  });

  it("rejects signed EVM hex blob with wrong nonce", async () => {
    const presignedTx: PresignedTx = await makeSignedEvmTx({
      nonce: 5,
      phase: "fundEphemeral",
      network: Networks.Polygon
    });

    const presignedTxWithWrongNonce: PresignedTx = { ...presignedTx, nonce: 99 };

    const ephemerals: {[key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, [presignedTxWithWrongNonce], ephemerals)).rejects.toThrow(
      "does not match expected nonce"
    );
  });

   it("rejects signed EVM hex blob with wrong signed nonce", async () => {
    const presignedTxWithWrongNonce: PresignedTx = withBackups(await makeSignedEvmTx({
      nonce: 99,
      phase: "fundEphemeral",
      network: Networks.Polygon
    }));

    const ephemerals: {[key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, [presignedTxWithWrongNonce], ephemerals)).rejects.toThrow(
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

    const ephemerals: {[key in EphemeralAccountType]: string } = {
      Substrate: "",
      EVM: EVM_SIGNER,
      Stellar: ""
    };

    await expect(validatePresignedTxs(RampDirection.BUY, [presignedTx], ephemerals)).rejects.toThrow(
      "does not match expected network ID"
    );
  });
});
