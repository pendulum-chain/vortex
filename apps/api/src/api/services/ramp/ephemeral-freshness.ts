import {
  ApiManager,
  type DestinationType,
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
  SubstrateApiNetwork
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../errors/api-error";

/**
 * The quote fields that determine which chains a ramp's ephemerals will sign on.
 * A subset of QuoteTicket so callers can pass a quote row directly.
 */
export interface FreshnessQuote {
  rampType: RampDirection;
  inputCurrency: string;
  outputCurrency: string;
  from: string;
  to: string;
}

interface SigningNetworks {
  evm: EvmNetworks[];
  substrate: SubstrateApiNetwork[];
}

/**
 * The chains a ramp's ephemerals will actually sign transactions on, derived from the
 * quote. Freshness is validated only against these chains so an outage on an RPC the
 * route never touches cannot block an unrelated registration (SPEC-015). Under-reporting
 * a chain here is a security hole — an unfresh chain would skip validation — so the set
 * mirrors the route topology in `transactions/{onramp,offramp}/` exactly; keep it in sync
 * when a route's chains change. `ephemeral-freshness.test.ts` pins every corridor's set.
 *
 * Both ephemerals are a single address reused across every chain of their type, so the
 * EVM/Substrate split here maps directly onto the two provided ephemeral addresses.
 */
export function quoteToSigningNetworks(quote: FreshnessQuote): SigningNetworks {
  const evm = new Set<EvmNetworks>();
  const substrate = new Set<SubstrateApiNetwork>();

  const addIfEvm = (network: Networks | undefined): void => {
    if (network && isNetworkEVM(network)) {
      evm.add(network);
    }
  };

  if (quote.rampType === RampDirection.SELL) {
    if (quote.outputCurrency === FiatToken.BRL) {
      // Fork on the input token: an EVM stable off-ramps on Base; an AssetHub asset
      // off-ramps via the Substrate ephemeral on Pendulum (offramp/index.ts).
      const fromNetwork = getNetworkFromDestination(quote.from as DestinationType);
      const inputTokenDetails = fromNetwork
        ? getOnChainTokenDetails(fromNetwork, quote.inputCurrency as OnChainToken)
        : undefined;
      if (inputTokenDetails && isEvmTokenDetails(inputTokenDetails)) {
        evm.add(Networks.Base);
      } else {
        substrate.add("pendulum");
      }
    } else if (quote.outputCurrency === FiatToken.EURC) {
      evm.add(Networks.Base); // evm-to-mykobo
    } else if (isAlfredpayToken(quote.outputCurrency as FiatToken)) {
      evm.add(Networks.Polygon); // evm-to-alfredpay
    }
    return { evm: [...evm], substrate: [...substrate] };
  }

  // On-ramps: a fixed hub chain plus the variable destination network (quote.to).
  const toNetwork = getNetworkFromDestination(quote.to as DestinationType);

  if (quote.inputCurrency === FiatToken.EURC) {
    // Mykobo (currently kill-switched, but mapped for completeness): Base + destination.
    evm.add(Networks.Base);
    addIfEvm(toNetwork);
  } else if (isAlfredpayToken(quote.inputCurrency as FiatToken)) {
    evm.add(Networks.Polygon); // mint chain
    addIfEvm(toNetwork);
  } else if (toNetwork === Networks.AssetHub) {
    // Avenia BRL -> AssetHub: the EVM ephemeral signs Moonbeam XCM (H160), the Substrate
    // ephemeral signs Pendulum, plus Hydration when the output is not USDC.
    evm.add(Networks.Moonbeam);
    substrate.add("pendulum");
    if (quote.outputCurrency !== "USDC") {
      substrate.add("hydration");
    }
  } else {
    // Avenia BRL -> EVM (Base): Base + destination.
    evm.add(Networks.Base);
    addIfEvm(toNetwork);
  }

  return { evm: [...evm], substrate: [...substrate] };
}

// SECURITY: fail-closed. Any RPC error rejects the registration since we cannot prove
// freshness without on-chain data. The chain set is scoped to the quote's route so an
// unrelated chain's RPC outage cannot block registrations that never touch it.
export async function validateEphemeralAccountsFresh(
  ephemerals: {
    [key in EphemeralAccountType]?: string;
  },
  quote: FreshnessQuote
): Promise<void> {
  const { evm: evmNetworks, substrate: substrateNetworks } = quoteToSigningNetworks(quote);
  const checks: Promise<void>[] = [];

  const substrateAddress = ephemerals[EphemeralAccountType.Substrate];
  if (substrateAddress) {
    for (const network of substrateNetworks) {
      checks.push(assertSubstrateAccountFresh(substrateAddress, network));
    }
  }

  const evmAddress = ephemerals[EphemeralAccountType.EVM];
  if (evmAddress) {
    for (const network of evmNetworks) {
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
  let balance: bigint;
  try {
    const client = EvmClientManager.getInstance().getClient(network);
    // Both must be zero to prove freshness: a nonce-0 account can still hold a native
    // balance (funded but never used), which the nonce-only check missed (SPEC-015).
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
      message: `EVM ephemeral ${address} is not fresh on ${network} (nonce=${nonce}, balance=${balance.toString()}). A new, unused ephemeral account must be provided.`,
      status: httpStatus.BAD_REQUEST
    });
  }
}
