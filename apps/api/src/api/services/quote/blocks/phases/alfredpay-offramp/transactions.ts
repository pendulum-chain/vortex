import {
  ALFREDPAY_ERC20_TOKEN,
  createOfframpSquidrouterTransactionsToEvm,
  EphemeralAccountType,
  EvmClientManager,
  type EvmNetworks,
  EvmToken,
  type EvmTokenDetails,
  evmTokenConfig,
  getNetworkId,
  getOnChainTokenDetails,
  Networks,
  type SignedTypedData
} from "@vortexfi/shared";
import Big from "big.js";
import { ContractFunctionExecutionError, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../../../../../../config/vars";
import erc20ABI from "../../../../../../contracts/ERC20";
import { getEvmFundingAccount } from "../../../../phases/evm-funding";
import { encodeEvmTransactionData } from "../../../../transactions";
import { addOnrampDestinationChainTransactions } from "../../../../transactions/onramp/common/transactions";
import { preparePolygonCleanupApproval } from "../../../../transactions/polygon/cleanup";
import { requireAccount } from "../../core/accounts";
import type { PrepareCtx, PreparedPhaseTxs, TxIntent } from "../../core/types";
import { ALFREDPAY_RELAYER_ADDRESSES, resolveAlfredpayPermitDomain } from "./permit";
import type { AlfredpayOfframpRegistrationFacts } from "./registration";
import type { AlfredpayOfframpMetadata } from "./simulation";

const permitProbeAbi = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "nonces",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  { inputs: [], name: "name", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" }
] as const;

export interface AlfredpayOfframpPreparation extends AlfredpayOfframpRegistrationFacts {
  isDirectTransfer: boolean;
  isNoPermitFallback: boolean;
  squidRouterPermitExecutionValue?: string;
  variant: AlfredpayOfframpSourceVariant;
}

export interface AlfredpayOfframpTransactionDependencies {
  createBridge?: typeof createOfframpSquidrouterTransactionsToEvm;
  executorAddress?: `0x${string}`;
  now?: () => number;
  probePermit?: () => Promise<{
    domain: Awaited<ReturnType<typeof resolveAlfredpayPermitDomain>>;
    nonce: bigint;
  } | null>;
}

export type AlfredpayOfframpSourceVariant =
  | "direct-permit"
  | "direct-no-permit"
  | "same-chain-squid-permit"
  | "same-chain-squid-no-permit"
  | "cross-chain-squid-permit"
  | "cross-chain-squid-no-permit";

export function classifyAlfredpayOfframpSource(
  fromNetwork: EvmNetworks,
  direct: boolean,
  supportsPermit: boolean
): AlfredpayOfframpSourceVariant {
  if (direct) return supportsPermit ? "direct-permit" : "direct-no-permit";
  const prefix = fromNetwork === Networks.Polygon ? "same-chain-squid" : "cross-chain-squid";
  return `${prefix}-${supportsPermit ? "permit" : "no-permit"}`;
}

function permitTypedData(
  domain: Awaited<ReturnType<typeof resolveAlfredpayPermitDomain>>,
  owner: string,
  spender: string,
  value: string,
  nonce: bigint,
  deadline: bigint
): SignedTypedData {
  return {
    domain,
    message: {
      deadline: deadline.toString(),
      nonce: nonce.toString(),
      owner,
      spender,
      value
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
}

export async function prepareAlfredpayOfframpTxs(
  ctx: PrepareCtx<AlfredpayOfframpMetadata, AlfredpayOfframpRegistrationFacts>,
  dependencies: AlfredpayOfframpTransactionDependencies = {}
): Promise<PreparedPhaseTxs> {
  const facts = ctx.ownRegistrationFacts;
  if (!facts) throw new Error("Alfredpay offramp registration facts are required");
  const evmEphemeral = requireAccount(ctx.accounts, EphemeralAccountType.EVM);
  const fromNetwork = ctx.ownMetadata.fromNetwork;
  const inputDetails = getOnChainTokenDetails(fromNetwork, ctx.globals.request.inputCurrency) as EvmTokenDetails | undefined;
  if (!inputDetails) throw new Error(`Missing input token details on ${fromNetwork}`);
  const inputToken = inputDetails.erc20AddressSourceChain as `0x${string}`;
  const inputAmountRaw = new Big(ctx.quote.inputAmount).mul(new Big(10).pow(inputDetails.decimals)).toFixed(0, 0);
  const direct = fromNetwork === Networks.Polygon && inputToken.toLowerCase() === ALFREDPAY_ERC20_TOKEN.toLowerCase();
  const publicClient = EvmClientManager.getInstance().getClient(fromNetwork);
  const chainId = getNetworkId(fromNetwork);
  if (chainId === undefined) throw new Error(`Unsupported EVM network ${fromNetwork}`);
  const permit = dependencies.probePermit
    ? await dependencies.probePermit()
    : await (async () => {
        try {
          const nonce = (await publicClient.readContract({
            abi: permitProbeAbi,
            address: inputToken,
            args: [facts.walletAddress as `0x${string}`],
            functionName: "nonces"
          })) as bigint;
          const tokenName = (await publicClient.readContract({
            abi: permitProbeAbi,
            address: inputToken,
            functionName: "name"
          })) as string;
          return { domain: await resolveAlfredpayPermitDomain(publicClient, inputToken, chainId, tokenName), nonce };
        } catch (error) {
          if (error instanceof ContractFunctionExecutionError) return null;
          throw error;
        }
      })();

  const intents: TxIntent[] = [];
  let squidRouterPermitExecutionValue: string | undefined;
  const now = dependencies.now?.() ?? Date.now();
  const createBridge = dependencies.createBridge ?? createOfframpSquidrouterTransactionsToEvm;
  const variant = classifyAlfredpayOfframpSource(fromNetwork, direct, permit !== null);
  if (permit) {
    const permitDeadline = BigInt(Math.floor(now / 1000) + 24 * 60 * 60);
    if (direct) {
      const executorAddress =
        dependencies.executorAddress ?? privateKeyToAccount(config.secrets.moonbeamExecutorPrivateKey as `0x${string}`).address;
      intents.push({
        lane: "main",
        network: fromNetwork,
        phase: "squidRouterPermitExecute",
        signer: facts.walletAddress,
        txData: [
          permitTypedData(permit.domain, facts.walletAddress, executorAddress, inputAmountRaw, permit.nonce, permitDeadline)
        ]
      });
    } else {
      const bridge = await createBridge({
        destinationAddress: evmEphemeral.address,
        fromAddress: facts.walletAddress,
        fromNetwork,
        fromToken: inputToken,
        rawAmount: inputAmountRaw,
        toNetwork: Networks.Polygon,
        toToken: ALFREDPAY_ERC20_TOKEN
      });
      const relayer = ALFREDPAY_RELAYER_ADDRESSES[fromNetwork];
      if (!relayer) throw new Error(`Alfredpay offramp permit flow is not supported on ${fromNetwork}`);
      const payloadNonce = BigInt(Math.floor(now / 1000));
      const payloadDeadline = BigInt(Math.floor(now / 1000) + 3600);
      const payload: SignedTypedData = {
        domain: { chainId, name: "TokenRelayer", verifyingContract: relayer, version: "1" },
        message: {
          data: bridge.swapData.data,
          deadline: payloadDeadline.toString(),
          destination: bridge.swapData.to,
          ethValue: bridge.swapData.value,
          nonce: payloadNonce.toString(),
          owner: facts.walletAddress,
          token: inputToken,
          value: inputAmountRaw
        },
        primaryType: "Payload",
        types: {
          Payload: [
            { name: "destination", type: "address" },
            { name: "owner", type: "address" },
            { name: "token", type: "address" },
            { name: "value", type: "uint256" },
            { name: "data", type: "bytes" },
            { name: "ethValue", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" }
          ]
        }
      };
      squidRouterPermitExecutionValue = bridge.swapData.value;
      intents.push({
        lane: "main",
        network: fromNetwork,
        phase: "squidRouterPermitExecute",
        signer: facts.walletAddress,
        txData: [
          permitTypedData(permit.domain, facts.walletAddress, relayer, inputAmountRaw, permit.nonce, permitDeadline),
          payload
        ]
      });
    }
  } else if (direct) {
    intents.push({
      lane: "main",
      network: fromNetwork,
      phase: "squidRouterNoPermitTransfer",
      signer: facts.walletAddress,
      txData: {
        data: encodeFunctionData({
          abi: erc20ABI,
          args: [evmEphemeral.address as `0x${string}`, BigInt(inputAmountRaw)],
          functionName: "transfer"
        }),
        gas: "0",
        to: inputToken,
        value: "0"
      }
    });
  } else {
    const bridge = await createBridge({
      destinationAddress: evmEphemeral.address,
      fromAddress: facts.walletAddress,
      fromNetwork,
      fromToken: inputToken,
      rawAmount: inputAmountRaw,
      toNetwork: Networks.Polygon,
      toToken: ALFREDPAY_ERC20_TOKEN
    });
    squidRouterPermitExecutionValue = bridge.swapData.value;
    intents.push(
      {
        lane: "main",
        network: fromNetwork,
        phase: "squidRouterNoPermitApprove",
        signer: facts.walletAddress,
        txData: bridge.approveData as TxIntent["txData"]
      },
      {
        lane: "main",
        network: fromNetwork,
        phase: "squidRouterNoPermitSwap",
        signer: facts.walletAddress,
        txData: bridge.swapData
      }
    );
  }

  const finalTransfer = await addOnrampDestinationChainTransactions({
    amountRaw: ctx.ownMetadata.inputAmountRaw,
    destinationNetwork: Networks.Polygon,
    toAddress: facts.depositAddress as `0x${string}`,
    toToken: ALFREDPAY_ERC20_TOKEN
  });
  const fallbackTransfer = await addOnrampDestinationChainTransactions({
    amountRaw: ctx.ownMetadata.inputAmountRaw,
    destinationNetwork: Networks.Polygon,
    toAddress: facts.walletAddress,
    toToken: ALFREDPAY_ERC20_TOKEN
  });
  intents.push(
    {
      lane: "main",
      network: Networks.Polygon,
      phase: "alfredpayOfframpTransfer",
      signer: evmEphemeral.address,
      txData: finalTransfer
    },
    {
      lane: "backup",
      network: Networks.Polygon,
      phase: "alfredpayOfframpTransferFallback",
      reuseFirstMainNonce: true,
      signer: evmEphemeral.address,
      txData: fallbackTransfer
    }
  );
  const axlUsdc = evmTokenConfig[Networks.Polygon][EvmToken.AXLUSDC]?.erc20AddressSourceChain;
  if (!axlUsdc) throw new Error("Invalid Polygon AXLUSDC configuration");
  const cleanup = await preparePolygonCleanupApproval(
    axlUsdc as `0x${string}`,
    getEvmFundingAccount(Networks.Polygon).address,
    Networks.Polygon
  );
  intents.push({
    lane: "cleanup",
    network: Networks.Polygon,
    phase: "polygonCleanupAxlUsdc",
    signer: evmEphemeral.address,
    txData: encodeEvmTransactionData(cleanup) as TxIntent["txData"]
  });
  return {
    intents,
    state: {
      ...facts,
      isDirectTransfer: direct,
      isNoPermitFallback: permit === null,
      squidRouterPermitExecutionValue,
      variant
    } satisfies AlfredpayOfframpPreparation
  };
}
