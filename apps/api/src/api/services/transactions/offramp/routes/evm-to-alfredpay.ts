import {
  createOfframpSquidrouterTransactionsToEvm,
  ERC20_USDC_POLYGON,
  EvmClientManager,
  EvmNetworks,
  EvmTokenDetails,
  EvmTransactionData,
  getNetworkFromDestination,
  getNetworkId,
  getOnChainTokenDetails,
  isEvmToken,
  isNetworkEVM,
  Networks,
  SignedTypedData,
  SQUDROUTER_MAIN_CONTRACT_POLYGON,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { StateMetadata } from "../../../phases/meta-state-types";
import { encodeEvmTransactionData } from "../../index";
import { addOnrampDestinationChainTransactions } from "../../onramp/common/transactions";
import { OfframpTransactionParams, OfframpTransactionsWithMeta } from "../common/types";

const RELAYER_ADDRESS = "0x93C399bB9D6736010Fa296a4eB3FEA148353F99D" as const; // Placeholder

const erc20Abi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "nonces",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  { inputs: [], name: "name", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" }
];

/**
 * Prepares all transactions for an EVM to Alfredpay (USD) offramp.
 * This route handles: EVM → Polygon (USDC) → Alfredpay (Fiat)
 */
export async function prepareEvmToAlfredpayOfframpTransactions({
  quote,
  signingAccounts,
  userAddress
}: OfframpTransactionParams): Promise<OfframpTransactionsWithMeta> {
  const unsignedTxs: UnsignedTx[] = [];
  let stateMeta: Partial<StateMetadata> = {};

  const evmClientManager = EvmClientManager.getInstance();

  const fromNetwork = getNetworkFromDestination(quote.from);
  if (!fromNetwork) {
    throw new Error(`Invalid network for destination ${quote.from}`);
  }

  const evmEphemeralEntry = signingAccounts.find(account => account.type === "EVM");
  if (!evmEphemeralEntry) {
    throw new Error("EVM ephemeral account not found");
  }

  const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency);
  if (!inputTokenDetails || !isEvmToken(quote.inputCurrency)) {
    throw new Error(`Input token details not found for ${quote.inputCurrency} on network ${fromNetwork}`);
  }

  if (!userAddress) {
    throw new Error("User address must be provided for offramping.");
  }

  if (!quote.metadata.alfredpayOfframp?.inputAmountRaw) {
    throw new Error("Missing alfredpayOfframp.inputAmountRaw in quote metadata");
  }

  if (!isNetworkEVM(fromNetwork)) {
    throw new Error(`Unsupported source network ${fromNetwork} for EVM to Alfredpay type offramp`);
  }

  const inputAmountRaw = new Big(quote.inputAmount).mul(new Big(10).pow(inputTokenDetails.decimals)).toFixed(0, 0);

  const bridgeResult = await createOfframpSquidrouterTransactionsToEvm({
    destinationAddress: evmEphemeralEntry.address,
    fromAddress: userAddress,
    fromNetwork,
    fromToken: (inputTokenDetails as EvmTokenDetails).erc20AddressSourceChain,
    rawAmount: inputAmountRaw,
    toNetwork: Networks.Polygon,
    toToken: ERC20_USDC_POLYGON
  });

  const permitDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from "now"

  const publicClient = evmClientManager.getClient(fromNetwork);

  const userNonce = (await publicClient.readContract({
    abi: erc20Abi,
    address: (inputTokenDetails as EvmTokenDetails).erc20AddressSourceChain,
    args: [userAddress],
    functionName: "nonces"
  })) as bigint;

  const tokenName = (await publicClient.readContract({
    abi: erc20Abi,
    address: (inputTokenDetails as EvmTokenDetails).erc20AddressSourceChain,
    functionName: "name"
  })) as string;

  const permitTypedData: SignedTypedData = {
    domain: {
      chainId: getNetworkId(Networks.Polygon),
      name: tokenName, // TODO need to get the version as well?
      verifyingContract: (inputTokenDetails as EvmTokenDetails).erc20AddressSourceChain,
      version: "2"
    },
    message: {
      deadline: permitDeadline,
      nonce: BigInt(userNonce),
      owner: userAddress,
      spender: RELAYER_ADDRESS,
      value: BigInt(inputAmountRaw)
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

  // Create payload typed data for the relayer
  const payloadNonce = BigInt(Math.floor(Date.now() / 1000)); // Use timestamp as nonce
  const payloadDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const payloadTypedData: SignedTypedData = {
    domain: {
      chainId: getNetworkId(Networks.Polygon)!,
      name: "TokenRelayer",
      verifyingContract: RELAYER_ADDRESS,
      version: "1"
    },
    message: {
      data: bridgeResult.swapData.data,
      deadline: payloadDeadline,
      destination: bridgeResult.swapData.to,
      nonce: payloadNonce
    },
    primaryType: "Payload",
    types: {
      Payload: [
        { name: "destination", type: "address" },
        { name: "data", type: "bytes" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    }
  };

  // Bundle both signatures into a single transaction
  const typedDataArray: SignedTypedData[] = [permitTypedData, payloadTypedData];

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon,
    nonce: 0,
    phase: "squidrouterPermitExecute",
    signer: userAddress,
    txData: typedDataArray
  });

  unsignedTxs.push({
    meta: {},
    network: fromNetwork,
    nonce: 0,
    phase: "squidRouterApprove",
    signer: userAddress,
    txData: encodeEvmTransactionData(bridgeResult.approveData) as EvmTransactionData
  });

  unsignedTxs.push({
    meta: {},
    network: fromNetwork,
    nonce: 0,
    phase: "squidRouterSwap",
    signer: userAddress,
    txData: encodeEvmTransactionData(bridgeResult.swapData) as EvmTransactionData
  });

  stateMeta = {
    ...stateMeta,
    evmEphemeralAddress: evmEphemeralEntry.address,
    squidRouterQuoteId: bridgeResult.squidRouterQuoteId,
    walletAddress: userAddress
  };

  const finalTransferTxData = await addOnrampDestinationChainTransactions({
    amountRaw: quote.metadata.alfredpayOfframp.inputAmountRaw,
    destinationNetwork: Networks.Polygon as EvmNetworks,
    toAddress: "0x0000000000000000000000000000000000000000", // placeholder
    toToken: ERC20_USDC_POLYGON
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon,
    nonce: 0,
    phase: "alfredpayOfframpTransfer",
    signer: evmEphemeralEntry.address,
    txData: finalTransferTxData
  });

  return { stateMeta, unsignedTxs };
}
