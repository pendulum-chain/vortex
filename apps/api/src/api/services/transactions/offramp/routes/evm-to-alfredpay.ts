import {
  ALFREDPAY_ERC20_TOKEN,
  ALFREDPAY_ONCHAIN_CURRENCY,
  AlfredPayCountry,
  AlfredPayStatus,
  AlfredpayApiService,
  AlfredpayChain,
  AlfredpayFiatCurrency,
  createOfframpSquidrouterTransactionsToEvm,
  EvmClientManager,
  EvmNetworks,
  EvmTokenDetails,
  FiatToken,
  getNetworkFromDestination,
  getNetworkId,
  getOnChainTokenDetails,
  isEvmToken,
  isNetworkEVM,
  Networks,
  SignedTypedData,
  TypedDataDomain,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeAbiParameters, keccak256, PublicClient, pad, parseAbiParameters, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MOONBEAM_FUNDING_PRIVATE_KEY } from "../../../../../constants/constants";
import AlfredPayCustomer from "../../../../../models/alfredPayCustomer.model";
import { StateMetadata } from "../../../phases/meta-state-types";
import { addOnrampDestinationChainTransactions } from "../../onramp/common/transactions";
import { OfframpTransactionParams, OfframpTransactionsWithMeta } from "../common/types";

export const RELAYER_ADDRESS = "0xC9ECD03c89349B3EAe4613c7091c6c3029413785" as const;

/**
 * Resolves the EIP-712 domain for a token's permit signature.
 * Some tokens (like USDT in polygon) use salt-based domain separation instead of chainId.
 */
async function resolvePermitDomain(
  publicClient: PublicClient,
  tokenAddress: `0x${string}`,
  chainId: number,
  tokenName: string
): Promise<TypedDataDomain> {
  let version = "1";
  try {
    version = (await publicClient.readContract({
      abi: [{ inputs: [], name: "version", outputs: [{ type: "string" }], type: "function" }],
      address: tokenAddress,
      functionName: "version"
    })) as string;
  } catch {
    // If version() fails, we stick with "1"
  }

  const standardHash = keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, bytes32, bytes32, uint256, address"), [
      keccak256(toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
      keccak256(toHex(tokenName)),
      keccak256(toHex(version)),
      BigInt(chainId),
      tokenAddress
    ])
  );

  let onChainSeparator: `0x${string}` | undefined;
  try {
    onChainSeparator = (await publicClient.readContract({
      abi: [{ inputs: [], name: "DOMAIN_SEPARATOR", outputs: [{ type: "bytes32" }], type: "function" }],
      address: tokenAddress,
      functionName: "DOMAIN_SEPARATOR"
    })) as `0x${string}`;
  } catch {
    // If we can't read it, fall back to using standard domain separator eventually
  }

  if (onChainSeparator !== undefined) {
    if (onChainSeparator !== standardHash) {
      // On-chain separator exists but doesn't match standard - compute salt hash for comparison
      const salt = pad(toHex(chainId), { size: 32 });
      const saltHash = keccak256(
        encodeAbiParameters(parseAbiParameters("bytes32, bytes32, bytes32, address, bytes32"), [
          keccak256(toHex("EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)")),
          keccak256(toHex(tokenName)),
          keccak256(toHex(version)),
          tokenAddress,
          salt
        ])
      );

      if (onChainSeparator === saltHash) {
        return { name: tokenName, salt, verifyingContract: tokenAddress, version };
      }

      // Neither matches - this is an error
      throw new Error(
        `Token ${tokenName} has unexpected DOMAIN_SEPARATOR. Expected standard: ${standardHash} or salt: ${saltHash}, got: ${onChainSeparator}`
      );
    }
    // use standard domain
    return { chainId, name: tokenName, verifyingContract: tokenAddress, version };
  }

  // No on-chain separator available - default to standard
  return { chainId, name: tokenName, verifyingContract: tokenAddress, version };
}

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
  fiatAccountId,
  quote,
  signingAccounts,
  userAddress,
  userId
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

  const fiatToCountry: Partial<Record<FiatToken, AlfredPayCountry>> = {
    [FiatToken.USD]: AlfredPayCountry.US,
    [FiatToken.MXN]: AlfredPayCountry.MX,
    [FiatToken.COP]: AlfredPayCountry.CO
  };
  const customerCountry = fiatToCountry[quote.outputCurrency as FiatToken];
  if (!customerCountry) {
    throw new Error(`Unsupported Alfredpay output currency: ${quote.outputCurrency}`);
  }

  const customer = await AlfredPayCustomer.findOne({
    where: { country: customerCountry, userId }
  });

  if (!customer) {
    throw new Error(`Alfredpay customer not found for userId ${userId}`);
  }

  if (customer.status !== AlfredPayStatus.Success) {
    throw new Error(`Alfredpay customer status is ${customer.status}, expected Success. Proceed first with KYC.`);
  }

  if (!fiatAccountId) {
    throw new Error("fiatAccountId is required for Alfredpay offramp");
  }

  const alfredpayQuoteId = quote.metadata.alfredpayOfframp?.quoteId;
  if (!alfredpayQuoteId) {
    throw new Error("Missing alfredpayOfframp.quoteId in quote metadata");
  }

  const alfredpayService = AlfredpayApiService.getInstance();
  const offrampOrder = await alfredpayService.createOfframp({
    amount: quote.inputAmount,
    chain: AlfredpayChain.MATIC,
    customerId: customer.alfredPayId,
    fiatAccountId,
    fromCurrency: ALFREDPAY_ONCHAIN_CURRENCY,
    originAddress: userAddress,
    quoteId: alfredpayQuoteId,
    toCurrency: quote.outputCurrency as unknown as AlfredpayFiatCurrency
  });

  const inputAmountRaw = new Big(quote.inputAmount).mul(new Big(10).pow(inputTokenDetails.decimals)).toFixed(0, 0);

  const bridgeResult = await createOfframpSquidrouterTransactionsToEvm({
    destinationAddress: evmEphemeralEntry.address,
    fromAddress: userAddress,
    fromNetwork,
    fromToken: (inputTokenDetails as EvmTokenDetails).erc20AddressSourceChain,
    rawAmount: inputAmountRaw,
    toNetwork: Networks.Polygon,
    toToken: ALFREDPAY_ERC20_TOKEN
  });

  const permitDeadline = BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60); // 24 hours from "now"

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

  const chainId = getNetworkId(fromNetwork)!;
  const resolvedDomain = await resolvePermitDomain(
    publicClient,
    (inputTokenDetails as EvmTokenDetails).erc20AddressSourceChain,
    chainId,
    tokenName
  );

  const permitTypedData: SignedTypedData = {
    domain: resolvedDomain,
    message: {
      deadline: permitDeadline.toString(),
      nonce: userNonce.toString(),
      owner: userAddress,
      spender: RELAYER_ADDRESS,
      value: inputAmountRaw.toString()
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
      chainId: getNetworkId(fromNetwork)!,
      name: "TokenRelayer",
      verifyingContract: RELAYER_ADDRESS,
      version: "1"
    },
    message: {
      data: bridgeResult.swapData.data,
      deadline: payloadDeadline.toString(),
      destination: bridgeResult.swapData.to,
      ethValue: bridgeResult.swapData.value,
      nonce: payloadNonce.toString(),
      owner: userAddress,
      token: (inputTokenDetails as EvmTokenDetails).erc20AddressSourceChain,
      value: inputAmountRaw.toString()
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

  // Bundle both signatures into a single transaction
  const typedDataArray: SignedTypedData[] = [permitTypedData, payloadTypedData];

  unsignedTxs.push({
    meta: {},
    network: fromNetwork,
    nonce: 0,
    phase: "squidRouterPermitExecute",
    signer: userAddress,
    txData: typedDataArray
  });

  stateMeta = {
    ...stateMeta,
    alfredpayTransactionId: offrampOrder.transactionId,
    alfredpayUserId: customer.alfredPayId,
    evmEphemeralAddress: evmEphemeralEntry.address,
    fiatAccountId,
    squidRouterPermitExecutionValue: bridgeResult.swapData.value,
    walletAddress: userAddress
  };

  const finalTransferTxData = await addOnrampDestinationChainTransactions({
    amountRaw: quote.metadata.alfredpayOfframp.inputAmountRaw,
    destinationNetwork: Networks.Polygon as EvmNetworks,
    toAddress: offrampOrder.depositAddress as `0x${string}`,
    toToken: ALFREDPAY_ERC20_TOKEN
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon,
    nonce: 0,
    phase: "alfredpayOfframpTransfer",
    signer: evmEphemeralEntry.address,
    txData: finalTransferTxData
  });

  const fundingAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);
  const fallbackTransferTxData = await addOnrampDestinationChainTransactions({
    amountRaw: quote.metadata.alfredpayOfframp.inputAmountRaw,
    destinationNetwork: Networks.Polygon as EvmNetworks,
    toAddress: fundingAccount.address,
    toToken: ALFREDPAY_ERC20_TOKEN
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon,
    nonce: 1,
    phase: "alfredpayOfframpTransferFallback",
    signer: evmEphemeralEntry.address,
    txData: fallbackTransferTxData
  });

  return { stateMeta, unsignedTxs };
}
