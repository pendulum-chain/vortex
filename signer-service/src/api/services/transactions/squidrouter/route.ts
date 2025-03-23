import axios from 'axios';
import { getSquidRouterConfig, squidRouterConfigBase } from './config';
import { getNetworkId, Networks } from '../../../helpers/networks';
import {
  AXL_USDC_MOONBEAM,
  EvmToken,
  EvmTokenDetails,
  getOnChainTokenDetails,
  isEvmToken,
} from '../../../../config/tokens';

export interface RouteParams {
  fromAddress: string;
  fromChain: string;
  fromToken: string;
  fromAmount: string;
  toChain: string;
  toToken: string;
  toAddress: string;
  slippageConfig: {
    autoMode: number;
  };
  enableExpress: boolean;
  postHook?: {
    chainType: string;
    calls: unknown[];
    provider: string;
    description: string;
    logoURI: string;
  };
}

export function createOnrampRouteParams(
  fromAddress: string,
  amount: string,
  outputTokenType: EvmToken,
  toNetwork: Networks,
  addressDestination: string,
): RouteParams {
  const fromChainId = getNetworkId(Networks.Moonbeam);
  const toChainId = getNetworkId(toNetwork);

  // will throw if invalid. Must exist.
  const outputTokenDetails = getOnChainTokenDetails(toNetwork, outputTokenType) as EvmTokenDetails;
  if (!outputTokenDetails) {
    throw new Error(`Token ${outputTokenType} is not supported for Squidrouter onramp`);
  }

  if (!isEvmToken(outputTokenDetails)) {
    throw new Error(`Token ${outputTokenType} is not supported on EVM chains`);
  }

  return {
    fromAddress: fromAddress,
    fromChain: fromChainId.toString(),
    fromToken: AXL_USDC_MOONBEAM,
    fromAmount: amount,
    toChain: toChainId.toString(),
    toToken: outputTokenDetails.erc20AddressSourceChain,
    toAddress: addressDestination,
    slippageConfig: {
      autoMode: 1,
    },
    enableExpress: true,
  };
}

export async function getRoute(params: RouteParams) {
  // This is the integrator ID for the Squid API at 'https://apiplus.squidrouter.com/v2'
  const { integratorId } = squidRouterConfigBase;
  const url = 'https://apiplus.squidrouter.com/v2/route';

  try {
    const result = await axios.post(url, params, {
      headers: {
        'x-integrator-id': integratorId,
        'Content-Type': 'application/json',
      },
    });

    const requestId = result.headers['x-request-id']; // Retrieve request ID from response headers
    return { data: result.data, requestId: requestId };
  } catch (error) {
    if (error) {
      console.error('Squidrouter API error:', (error as { response: { data: unknown } }).response.data);
    }
    console.error('Error with parameters:', params);
    throw error;
  }
}

export async function testRoute(
  testingToken: EvmTokenDetails,
  attemptedAmountRaw: string,
  address: string,
  fromNetwork: Networks,
) {
  const { fromChainId, toChainId, axlUSDC_MOONBEAM } = getSquidRouterConfig(fromNetwork);

  const sharedRouteParams: RouteParams = {
    fromAddress: address,
    fromChain: fromChainId,
    fromToken: testingToken.erc20AddressSourceChain,
    fromAmount: attemptedAmountRaw,
    toChain: toChainId,
    toToken: axlUSDC_MOONBEAM,
    toAddress: address,
    slippageConfig: {
      autoMode: 1,
    },
    enableExpress: true,
  };

  // will throw if no route is found
  await getRoute(sharedRouteParams);
}
