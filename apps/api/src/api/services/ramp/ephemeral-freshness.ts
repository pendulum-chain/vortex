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

const SUPPORTED_SUBSTRATE_NETWORKS: SubstrateApiNetwork[] = ["pendulum", "assethub"];

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
// Hydration is intentionally excluded while Hydration-backed routes are disabled; otherwise unrelated registrations
// would open the Hydration RPC even when their route never signs on Hydration.
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

  await Promise.all(checks);
}

async function assertSubstrateAccountFresh(address: string, network: SubstrateApiNetwork): Promise<void> {
  let nonce: number;
  let free: string;
  try {
    const { api } = await ApiManager.getInstance().getApi(network);
    const accountInfo = (await api.query.system.account(address)) as {
      data: { free: { toString(): string } };
      nonce: { toNumber(): number };
    };
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
