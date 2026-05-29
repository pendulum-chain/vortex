import {
  ApiManager,
  EphemeralAccountType,
  EvmClientManager,
  EvmNetworks,
  FiatToken,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isAlfredpayToken,
  isEvmTokenDetails,
  isNetworkEVM,
  Networks,
  OnChainToken,
  RampDirection,
  RegisterRampRequest,
  SubstrateApiNetwork
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { config } from "../../../config/vars";
import QuoteTicket from "../../../models/quoteTicket.model";
import { APIError } from "../../errors/api-error";
import { loadAccountWithRetry } from "../stellar/loadAccount";

export interface EphemeralNetworks {
  substrate: SubstrateApiNetwork[];
  evm: EvmNetworks[];
  stellar: boolean;
}

const USDC = "usdc";
const POLYGON_NETWORK: EvmNetworks = config.sandboxEnabled ? Networks.PolygonAmoy : Networks.Polygon;

// SECURITY: mirrors the dispatcher logic in apps/api/src/api/services/transactions/{offramp,onramp}/index.ts.
// If you add a new route variant or change a sub-builder's network assignments, you MUST update this function too.
// A missed network leaves a freshness-check gap.
export function getEphemeralNetworksForQuote(
  quote: QuoteTicket,
  additionalData?: RegisterRampRequest["additionalData"]
): EphemeralNetworks {
  const result: EphemeralNetworks = { evm: [], stellar: false, substrate: [] };

  if (quote.rampType === RampDirection.SELL) {
    return getOfframpNetworks(quote, additionalData, result);
  }
  return getOnrampNetworks(quote, result);
}

function getOfframpNetworks(
  quote: QuoteTicket,
  additionalData: RegisterRampRequest["additionalData"] | undefined,
  result: EphemeralNetworks
): EphemeralNetworks {
  const fromNetwork = getNetworkFromDestination(quote.from);
  if (!fromNetwork) {
    throw new Error(`Invalid network for destination ${quote.from}`);
  }

  const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency as OnChainToken);
  const inputIsEvm = !!(inputTokenDetails && isEvmTokenDetails(inputTokenDetails));

  if (quote.outputCurrency === FiatToken.BRL) {
    if (inputIsEvm) {
      result.evm.push(Networks.Base);
    } else {
      result.substrate.push("pendulum");
    }
    return result;
  }

  if (quote.outputCurrency === FiatToken.EURC && additionalData?.moneriumAuthToken) {
    return result;
  }

  if (isAlfredpayToken(quote.outputCurrency as FiatToken)) {
    result.evm.push(POLYGON_NETWORK);
    return result;
  }

  result.substrate.push("pendulum");
  result.stellar = true;
  return result;
}

function getOnrampNetworks(quote: QuoteTicket, result: EphemeralNetworks): EphemeralNetworks {
  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork) {
    throw new Error(`Invalid network for destination ${quote.to}`);
  }
  const outputIsUsdc = (quote.outputCurrency as string).toLowerCase() === USDC;

  if (quote.inputCurrency === FiatToken.BRL) {
    if (toNetwork === Networks.AssetHub) {
      result.evm.push(Networks.Moonbeam);
      result.substrate.push("pendulum");
      if (!outputIsUsdc) {
        result.substrate.push("hydration");
      }
    } else {
      pushEvmDedup(result, Networks.Base);
      if (isNetworkEVM(toNetwork)) {
        pushEvmDedup(result, toNetwork);
      }
    }
    return result;
  }

  if (quote.inputCurrency === FiatToken.EURC) {
    if (toNetwork === Networks.AssetHub) {
      pushEvmDedup(result, POLYGON_NETWORK);
      pushEvmDedup(result, Networks.Moonbeam);
      result.substrate.push("pendulum");
      if (!outputIsUsdc) {
        result.substrate.push("hydration");
      }
    } else {
      pushEvmDedup(result, POLYGON_NETWORK);
      if (isNetworkEVM(toNetwork)) {
        pushEvmDedup(result, toNetwork);
      }
    }
    return result;
  }

  if (isAlfredpayToken(quote.inputCurrency as FiatToken)) {
    pushEvmDedup(result, POLYGON_NETWORK);
    if (isNetworkEVM(toNetwork)) {
      pushEvmDedup(result, toNetwork);
    }
    return result;
  }

  throw new Error(`Unsupported onramp input currency: ${quote.inputCurrency}`);
}

function pushEvmDedup(result: EphemeralNetworks, network: EvmNetworks): void {
  if (!result.evm.includes(network)) {
    result.evm.push(network);
  }
}

// SECURITY: fail-closed. Any RPC error rejects the registration since we cannot prove freshness without on-chain data.
export async function validateEphemeralAccountsFresh(
  ephemerals: { [key in EphemeralAccountType]?: string },
  networks: EphemeralNetworks
): Promise<void> {
  const checks: Promise<void>[] = [];

  if (networks.substrate.length > 0) {
    const substrateAddress = ephemerals[EphemeralAccountType.Substrate];
    if (!substrateAddress) {
      throw new APIError({
        message: "Substrate ephemeral address is required for this ramp route but was not provided.",
        status: httpStatus.BAD_REQUEST
      });
    }
    for (const network of networks.substrate) {
      checks.push(assertSubstrateAccountFresh(substrateAddress, network));
    }
  }

  if (networks.evm.length > 0) {
    const evmAddress = ephemerals[EphemeralAccountType.EVM];
    if (!evmAddress) {
      throw new APIError({
        message: "EVM ephemeral address is required for this ramp route but was not provided.",
        status: httpStatus.BAD_REQUEST
      });
    }
    for (const network of networks.evm) {
      checks.push(assertEvmAccountFresh(evmAddress, network));
    }
  }

  if (networks.stellar) {
    const stellarAddress = ephemerals[EphemeralAccountType.Stellar];
    if (!stellarAddress) {
      throw new APIError({
        message: "Stellar ephemeral address is required for this ramp route but was not provided.",
        status: httpStatus.BAD_REQUEST
      });
    }
    checks.push(assertStellarAccountFresh(stellarAddress));
  }

  await Promise.all(checks);
}

async function assertSubstrateAccountFresh(address: string, network: SubstrateApiNetwork): Promise<void> {
  let nonce: number;
  let free: string;
  try {
    const { api } = await ApiManager.getInstance().getApi(network);
    // @ts-ignore - api.query.system.account return type is dynamic per chain
    const accountInfo = await api.query.system.account(address);
    nonce = accountInfo.nonce.toNumber();
    free = accountInfo.data.free.toString();
  } catch (error) {
    throw new APIError({
      message: `Could not verify freshness of Substrate ephemeral ${address} on ${network}: ${(error as Error).message}`,
      status: httpStatus.SERVICE_UNAVAILABLE
    });
  }

  if (nonce !== 0 || !Big(free).eq(0)) {
    throw new APIError({
      message: `Substrate ephemeral ${address} is not fresh on ${network} (nonce=${nonce}, free=${free}). A new, unused ephemeral account must be provided.`,
      status: httpStatus.BAD_REQUEST
    });
  }
}

async function assertEvmAccountFresh(address: string, network: EvmNetworks): Promise<void> {
  let nonce: number;
  let balance: bigint;
  try {
    const client = EvmClientManager.getInstance().getClient(network);
    [nonce, balance] = await Promise.all([
      client.getTransactionCount({ address: address as `0x${string}` }),
      client.getBalance({ address: address as `0x${string}` })
    ]);
  } catch (error) {
    throw new APIError({
      message: `Could not verify freshness of EVM ephemeral ${address} on ${network}: ${(error as Error).message}`,
      status: httpStatus.SERVICE_UNAVAILABLE
    });
  }

  if (nonce !== 0 || balance !== 0n) {
    throw new APIError({
      message: `EVM ephemeral ${address} is not fresh on ${network} (nonce=${nonce}, balance=${balance}). A new, unused ephemeral account must be provided.`,
      status: httpStatus.BAD_REQUEST
    });
  }
}

async function assertStellarAccountFresh(address: string): Promise<void> {
  let account: Awaited<ReturnType<typeof loadAccountWithRetry>>;
  try {
    account = await loadAccountWithRetry(address);
  } catch (error) {
    throw new APIError({
      message: `Could not verify freshness of Stellar ephemeral ${address}: ${(error as Error).message}`,
      status: httpStatus.SERVICE_UNAVAILABLE
    });
  }

  if (account !== null) {
    throw new APIError({
      message: `Stellar ephemeral ${address} already exists on-chain (sequence=${account.sequence}). The server creates and funds this account during the ramp; the provided address must not exist yet.`,
      status: httpStatus.BAD_REQUEST
    });
  }
}
