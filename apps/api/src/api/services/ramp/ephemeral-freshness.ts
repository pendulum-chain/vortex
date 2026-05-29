import {
  ApiManager,
  EphemeralAccountType,
  EvmClientManager,
  EvmNetworks,
  Networks,
  SubstrateApiNetwork
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../errors/api-error";
import { loadAccountWithRetry } from "../stellar/loadAccount";

const SUPPORTED_SUBSTRATE_NETWORKS: SubstrateApiNetwork[] = ["pendulum", "hydration", "assethub"];

const SUPPORTED_EVM_NETWORKS: EvmNetworks[] = [
  Networks.Arbitrum,
  Networks.Avalanche,
  Networks.Base,
  Networks.BSC,
  Networks.Ethereum,
  Networks.Moonbeam,
  Networks.Polygon,
  Networks.PolygonAmoy,
  Networks.BaseSepolia
];

// SECURITY: fail-closed. Any RPC error rejects the registration since we cannot prove freshness without on-chain data.
// We check every supported network unconditionally rather than deriving the route-relevant subset, so a buggy/missing
// route mapping cannot reopen a freshness gap when new phase handlers add chains an ephemeral signs on.
export async function validateEphemeralAccountsFresh(
  ephemerals: {
    [key in EphemeralAccountType]?: string;
  }
): Promise<void> {
  const checks: Promise<void>[] = [];

  const substrateAddress = ephemerals[EphemeralAccountType.Substrate];
  if (substrateAddress) {
    for (const network of SUPPORTED_SUBSTRATE_NETWORKS) {
      checks.push(assertSubstrateAccountFresh(substrateAddress, network));
    }
  }

  const evmAddress = ephemerals[EphemeralAccountType.EVM];
  if (evmAddress) {
    for (const network of SUPPORTED_EVM_NETWORKS) {
      checks.push(assertEvmAccountFresh(evmAddress, network));
    }
  }

  const stellarAddress = ephemerals[EphemeralAccountType.Stellar];
  if (stellarAddress) {
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
  try {
    const client = EvmClientManager.getInstance().getClient(network);
    nonce = await client.getTransactionCount({ address: address as `0x${string}` });
  } catch (error) {
    throw new APIError({
      message: `Could not verify freshness of EVM ephemeral ${address} on ${network}: ${(error as Error).message}`,
      status: httpStatus.SERVICE_UNAVAILABLE
    });
  }

  if (nonce !== 0) {
    throw new APIError({
      message: `EVM ephemeral ${address} is not fresh on ${network} (nonce=${nonce}). A new, unused ephemeral account must be provided.`,
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
