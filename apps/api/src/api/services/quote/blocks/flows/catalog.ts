import {
  EvmToken,
  evmTokenConfig,
  FiatToken,
  getNetworkFromDestination,
  isAlfredpayToken,
  isNetworkEVM,
  mapFiatToDestination,
  Networks,
  RampDirection
} from "@vortexfi/shared";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import type { FlowMetadata } from "../core/metadata";
import type { Flow } from "../core/types";
import { alfredpayOnrampCrossChainFlow, makeAlfredpayOnrampCrossChainFlow } from "./alfredpay-onramp-cross-chain";
import { alfredpayOnrampDirectFlow, makeAlfredpayOnrampDirectFlow } from "./alfredpay-onramp-direct";
import { brlOnrampBaseCrossChainFlow, makeBrlOnrampBaseCrossChainFlow } from "./brl-onramp-base-cross-chain";
import { brlOnrampBaseDirectFlow } from "./brl-onramp-base-direct";

type FlowRequest = FlowMetadata["globals"]["request"];

interface FlowDefinition {
  create(request: FlowRequest): Flow;
  executorFlow: Flow;
  matches(request: FlowRequest): boolean;
}

const flowDefinitions: FlowDefinition[] = [
  {
    create(request) {
      return makeAlfredpayOnrampDirectFlow(request.outputCurrency);
    },
    executorFlow: alfredpayOnrampDirectFlow,
    matches(request) {
      return (
        request.rampType === RampDirection.BUY &&
        isAlfredpayToken(request.inputCurrency) &&
        request.from === mapFiatToDestination(request.inputCurrency) &&
        evmTokenConfig[Networks.Polygon][request.outputCurrency as EvmToken] !== undefined &&
        getNetworkFromDestination(request.to) === Networks.Polygon
      );
    }
  },
  {
    create() {
      return brlOnrampBaseDirectFlow;
    },
    executorFlow: brlOnrampBaseDirectFlow,
    matches(request) {
      return (
        request.rampType === RampDirection.BUY &&
        request.inputCurrency === FiatToken.BRL &&
        request.from === mapFiatToDestination(FiatToken.BRL) &&
        request.outputCurrency === EvmToken.BRLA &&
        getNetworkFromDestination(request.to) === Networks.Base
      );
    }
  },
  {
    create(request) {
      const network = getNetworkFromDestination(request.to);
      if (!network) {
        throw new APIError({ message: `Unsupported destination: ${request.to}`, status: httpStatus.BAD_REQUEST });
      }
      return makeAlfredpayOnrampCrossChainFlow(network, request.outputCurrency);
    },
    executorFlow: alfredpayOnrampCrossChainFlow,
    matches(request) {
      const network = getNetworkFromDestination(request.to);
      return (
        request.rampType === RampDirection.BUY &&
        isAlfredpayToken(request.inputCurrency) &&
        network !== undefined &&
        network !== Networks.Polygon &&
        isNetworkEVM(network)
      );
    }
  },
  {
    create(request) {
      const network = getNetworkFromDestination(request.to);
      if (!network) {
        throw new APIError({ message: `Unsupported destination: ${request.to}`, status: httpStatus.BAD_REQUEST });
      }
      return makeBrlOnrampBaseCrossChainFlow(network, request.outputCurrency);
    },
    executorFlow: brlOnrampBaseCrossChainFlow,
    matches(request) {
      const network = getNetworkFromDestination(request.to);
      return (
        request.rampType === RampDirection.BUY &&
        request.inputCurrency === FiatToken.BRL &&
        network !== undefined &&
        network !== Networks.Base &&
        isNetworkEVM(network)
      );
    }
  }
];

export function resolveBlockFlow(request: FlowRequest): Flow {
  const definition = flowDefinitions.find(candidate => candidate.matches(request));
  if (!definition) {
    throw new APIError({
      message: `No block flow mapped for ${request.rampType} ${request.from}/${request.inputCurrency} -> ${request.to}/${request.outputCurrency}`,
      status: httpStatus.BAD_REQUEST
    });
  }
  return definition.create(request);
}

export function getBlockExecutorFlows(): Flow[] {
  return flowDefinitions.map(definition => definition.executorFlow);
}
