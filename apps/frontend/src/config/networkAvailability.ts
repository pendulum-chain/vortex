import { Networks } from "@vortexfi/shared";

const DISABLED_FRONTEND_NETWORKS = new Set<Networks>([Networks.AssetHub]);

function normalizeNetwork(network: Networks | string | undefined): Networks | undefined {
  if (!network) {
    return undefined;
  }

  const normalized = network.toLowerCase();
  return Object.values(Networks).find(candidate => candidate.toLowerCase() === normalized);
}

export function isFrontendNetworkEnabled(network: Networks | string | undefined): boolean {
  const normalizedNetwork = normalizeNetwork(network);
  return normalizedNetwork ? !DISABLED_FRONTEND_NETWORKS.has(normalizedNetwork) : false;
}

export function getFallbackFrontendNetwork(): Networks {
  return Networks.Polygon;
}

export function getEnabledFrontendNetwork(network: Networks | string | undefined): Networks {
  const normalizedNetwork = normalizeNetwork(network);
  return normalizedNetwork && isFrontendNetworkEnabled(normalizedNetwork) ? normalizedNetwork : getFallbackFrontendNetwork();
}
