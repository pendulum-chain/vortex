import {
  AssetHubToken,
  EPaymentMethod,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  getNetworkFromDestination,
  isDomesticToken,
  isEvmToken,
  isNetworkEVM,
  mapFiatToDestination,
  Networks,
  RampDirection
} from "@vortexfi/shared";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import type { FlowIdentity } from "../core/identity";
import { assertFlowIdentity } from "../core/identity";
import type { FlowMetadata } from "../core/metadata";
import { getFlowMetadata } from "../core/metadata";
import type { Flow } from "../core/types";
import { alfredpayOfframpFlow, makeAlfredpayOfframpFlow } from "./alfredpay-offramp";
import { alfredpayOnrampCrossChainFlow, makeAlfredpayOnrampCrossChainFlow } from "./alfredpay-onramp-cross-chain";
import { alfredpayOnrampDirectFlow, makeAlfredpayOnrampDirectFlow } from "./alfredpay-onramp-direct";
import { brlOfframpAssethubUsdcFlow } from "./brl-offramp-assethub-usdc";
import { brlOfframpBaseFlow, makeBrlOfframpBaseFlow } from "./brl-offramp-base";
import { brlOnrampAssethubUsdcFlow } from "./brl-onramp-assethub-usdc";
import { brlOnrampBaseCrossChainFlow, makeBrlOnrampBaseCrossChainFlow } from "./brl-onramp-base-cross-chain";
import { brlOnrampBaseDirectFlow } from "./brl-onramp-base-direct";
import {
  brlOnrampBaseSameChainFlow,
  brlOnrampBaseSameChainSwapFlow,
  makeBrlOnrampBaseSameChainSwapFlow
} from "./brl-onramp-base-same-chain";
import { eurOfframpBaseFlow, makeEurOfframpBaseFlow } from "./eur-offramp-base";
import { eurOnrampBaseCrossChainFlow, makeEurOnrampBaseCrossChainFlow } from "./eur-onramp-base-cross-chain";
import { eurOnrampBaseDirectFlow } from "./eur-onramp-base-direct";
import {
  eurOnrampBaseSameChainFlow,
  eurOnrampBaseSameChainSwapFlow,
  makeEurOnrampBaseSameChainSwapFlow
} from "./eur-onramp-base-same-chain";

type FlowRequest = FlowMetadata["globals"]["request"];

interface FlowDefinition {
  create(request: FlowRequest): Flow;
  executorFlow: Flow;
  matches(request: FlowRequest): boolean;
}

const flowDefinitions: FlowDefinition[] = [
  {
    create() {
      return brlOfframpAssethubUsdcFlow;
    },
    executorFlow: brlOfframpAssethubUsdcFlow,
    matches(request) {
      return (
        request.rampType === RampDirection.SELL &&
        request.from === Networks.AssetHub &&
        request.network === Networks.AssetHub &&
        request.inputCurrency === AssetHubToken.USDC &&
        request.outputCurrency === FiatToken.BRL &&
        request.to === EPaymentMethod.PIX
      );
    }
  },
  {
    create() {
      return brlOnrampAssethubUsdcFlow;
    },
    executorFlow: brlOnrampAssethubUsdcFlow,
    matches(request) {
      return (
        request.rampType === RampDirection.BUY &&
        request.from === EPaymentMethod.PIX &&
        request.inputCurrency === FiatToken.BRL &&
        request.outputCurrency === AssetHubToken.USDC &&
        getNetworkFromDestination(request.to) === Networks.AssetHub
      );
    }
  },
  {
    create(request) {
      const network = getNetworkFromDestination(request.from);
      if (!network || !isNetworkEVM(network) || !isEvmToken(request.inputCurrency)) {
        throw new APIError({ message: "Unsupported EVM source for EUR offramp", status: httpStatus.BAD_REQUEST });
      }
      return makeEurOfframpBaseFlow(request.inputCurrency, network);
    },
    executorFlow: eurOfframpBaseFlow,
    matches(request) {
      const network = getNetworkFromDestination(request.from);
      return (
        request.rampType === RampDirection.SELL &&
        request.outputCurrency === FiatToken.EURC &&
        request.to === EPaymentMethod.SEPA &&
        network !== undefined &&
        isNetworkEVM(network) &&
        isEvmToken(request.inputCurrency) &&
        evmTokenConfig[network][request.inputCurrency] !== undefined
      );
    }
  },
  {
    create(request) {
      const network = getNetworkFromDestination(request.from);
      if (!network || !isNetworkEVM(network) || !isEvmToken(request.inputCurrency)) {
        throw new APIError({ message: "Unsupported EVM source for BRL offramp", status: httpStatus.BAD_REQUEST });
      }
      return makeBrlOfframpBaseFlow(request.inputCurrency, network);
    },
    executorFlow: brlOfframpBaseFlow,
    matches(request) {
      const network = getNetworkFromDestination(request.from);
      return (
        request.rampType === RampDirection.SELL &&
        request.outputCurrency === FiatToken.BRL &&
        network !== undefined &&
        isNetworkEVM(network) &&
        isEvmToken(request.inputCurrency) &&
        evmTokenConfig[network][request.inputCurrency] !== undefined
      );
    }
  },
  {
    create(request) {
      const network = getNetworkFromDestination(request.from);
      if (!network || !isNetworkEVM(network)) {
        throw new APIError({ message: `Unsupported source: ${request.from}`, status: httpStatus.BAD_REQUEST });
      }
      return makeAlfredpayOfframpFlow(request.inputCurrency as EvmToken, network);
    },
    executorFlow: alfredpayOfframpFlow,
    matches(request) {
      const network = getNetworkFromDestination(request.from);
      return (
        request.rampType === RampDirection.SELL &&
        isDomesticToken(request.outputCurrency) &&
        request.to === mapFiatToDestination(request.outputCurrency as FiatToken) &&
        network !== undefined &&
        isNetworkEVM(network) &&
        evmTokenConfig[network][request.inputCurrency as EvmToken] !== undefined
      );
    }
  },
  {
    create() {
      return eurOnrampBaseDirectFlow;
    },
    executorFlow: eurOnrampBaseDirectFlow,
    matches(request) {
      return (
        request.rampType === RampDirection.BUY &&
        request.from === EPaymentMethod.SEPA &&
        request.inputCurrency === FiatToken.EURC &&
        request.outputCurrency === EvmToken.EURC &&
        getNetworkFromDestination(request.to) === Networks.Base
      );
    }
  },
  {
    create() {
      return eurOnrampBaseSameChainFlow;
    },
    executorFlow: eurOnrampBaseSameChainFlow,
    matches(request) {
      return (
        request.rampType === RampDirection.BUY &&
        request.from === EPaymentMethod.SEPA &&
        request.inputCurrency === FiatToken.EURC &&
        request.outputCurrency === EvmToken.USDC &&
        getNetworkFromDestination(request.to) === Networks.Base
      );
    }
  },
  {
    create(request) {
      return makeEurOnrampBaseSameChainSwapFlow(request.outputCurrency);
    },
    executorFlow: eurOnrampBaseSameChainSwapFlow,
    matches(request) {
      return (
        request.rampType === RampDirection.BUY &&
        request.from === EPaymentMethod.SEPA &&
        request.inputCurrency === FiatToken.EURC &&
        request.outputCurrency !== EvmToken.EURC &&
        request.outputCurrency !== EvmToken.USDC &&
        evmTokenConfig[Networks.Base][request.outputCurrency as EvmToken] !== undefined &&
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
      return makeEurOnrampBaseCrossChainFlow(network, request.outputCurrency);
    },
    executorFlow: eurOnrampBaseCrossChainFlow,
    matches(request) {
      const network = getNetworkFromDestination(request.to);
      return (
        request.rampType === RampDirection.BUY &&
        request.from === EPaymentMethod.SEPA &&
        request.inputCurrency === FiatToken.EURC &&
        network !== undefined &&
        network !== Networks.Base &&
        isNetworkEVM(network)
      );
    }
  },
  {
    create(request) {
      return makeAlfredpayOnrampDirectFlow(request.outputCurrency);
    },
    executorFlow: alfredpayOnrampDirectFlow,
    matches(request) {
      return (
        request.rampType === RampDirection.BUY &&
        isDomesticToken(request.inputCurrency) &&
        request.from === mapFiatToDestination(request.inputCurrency) &&
        evmTokenConfig[Networks.Polygon][request.outputCurrency as EvmToken] !== undefined &&
        getNetworkFromDestination(request.to) === Networks.Polygon
      );
    }
  },
  {
    create() {
      return brlOnrampBaseSameChainFlow;
    },
    executorFlow: brlOnrampBaseSameChainFlow,
    matches(request) {
      return (
        request.rampType === RampDirection.BUY &&
        request.inputCurrency === FiatToken.BRL &&
        request.from === mapFiatToDestination(FiatToken.BRL) &&
        request.outputCurrency === EvmToken.USDC &&
        getNetworkFromDestination(request.to) === Networks.Base
      );
    }
  },
  {
    create(request) {
      return makeBrlOnrampBaseSameChainSwapFlow(request.outputCurrency);
    },
    executorFlow: brlOnrampBaseSameChainSwapFlow,
    matches(request) {
      return (
        request.rampType === RampDirection.BUY &&
        request.inputCurrency === FiatToken.BRL &&
        request.from === mapFiatToDestination(FiatToken.BRL) &&
        request.outputCurrency !== EvmToken.BRLA &&
        request.outputCurrency !== EvmToken.USDC &&
        evmTokenConfig[Networks.Base][request.outputCurrency as EvmToken] !== undefined &&
        getNetworkFromDestination(request.to) === Networks.Base
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
        isDomesticToken(request.inputCurrency) &&
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
  const definitions = flowDefinitions.filter(candidate => candidate.matches(request));
  if (definitions.length === 0) {
    throw new APIError({
      message: `No block flow mapped for ${request.rampType} ${request.from}/${request.inputCurrency} -> ${request.to}/${request.outputCurrency}`,
      status: httpStatus.BAD_REQUEST
    });
  }
  if (definitions.length > 1) {
    throw new APIError({
      message: `Ambiguous block flow mapping for ${request.rampType} ${request.from}/${request.inputCurrency} -> ${request.to}/${request.outputCurrency}: ${definitions
        .map(definition => definition.executorFlow.identity.id)
        .join(", ")}`,
      status: httpStatus.INTERNAL_SERVER_ERROR
    });
  }
  return definitions[0].create(request);
}

export function resolvePersistedBlockFlow(metadataValue: unknown): Flow {
  const metadata = getFlowMetadata(metadataValue);
  if (!metadata.flow) {
    const legacyFlow = resolveBlockFlow(metadata.globals.request);
    legacyFlow.assertMetadata(metadata, { allowLegacy: true });
    return legacyFlow;
  }

  const candidates = flowDefinitions.filter(definition => {
    const identity = definition.executorFlow.identity;
    return (
      identity.id === metadata.flow?.id &&
      identity.version === metadata.flow.version &&
      identity.catalogVersion === metadata.flow.catalogVersion &&
      definition.matches(metadata.globals.request)
    );
  });
  if (candidates.length !== 1) {
    throw new Error(
      `Unsupported or ambiguous persisted flow ${metadata.flow.id}@${metadata.flow.version} for catalog ${metadata.flow.catalogVersion}`
    );
  }
  const flow = candidates[0].create(metadata.globals.request);
  assertFlowIdentity(metadata.flow, flow.identity);
  flow.assertMetadata(metadata);
  return flow;
}

export function getBlockFlowByIdentity(identity: FlowIdentity): Flow {
  const candidates = getBlockExecutorFlows().filter(
    flow => flow.identity.id === identity.id && flow.identity.version === identity.version
  );
  const unique = [...new Map(candidates.map(flow => [`${flow.identity.id}@${flow.identity.version}`, flow])).values()];
  if (unique.length !== 1) {
    throw new Error(`Unsupported persisted flow ${identity.id}@${identity.version}`);
  }
  assertFlowIdentity(identity, unique[0].identity);
  return unique[0];
}

export function getBlockExecutorFlows(): Flow[] {
  return flowDefinitions.map(definition => definition.executorFlow);
}
