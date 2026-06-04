import { isIP } from "node:net";
import { RegisterRampRequest } from "@vortexfi/shared";
import logger from "../../config/logger";
import { config } from "../../config/vars";

const IPV4_MAPPED_IPV6_PREFIX = "::ffff:";
const PUBLIC_IP_LOOKUP_URL = "https://api.ipify.org?format=json";
const PUBLIC_IP_LOOKUP_TIMEOUT_MS = 2000;
const PUBLIC_IP_CACHE_TTL_MS = 10 * 60 * 1000;

interface RequestIpSource {
  ip?: string;
}

let cachedHostPublicIp: { value: string; expiresAt: number } | undefined;

function isLoopbackIp(ipAddress: string): boolean {
  return (
    ipAddress === "127.0.0.1" ||
    ipAddress.startsWith("10.") ||
    /^192\.168\./.test(ipAddress) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ipAddress)
  );
}

async function fetchHostPublicIp(): Promise<string | undefined> {
  const now = Date.now();
  if (cachedHostPublicIp && cachedHostPublicIp.expiresAt > now) {
    return cachedHostPublicIp.value;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PUBLIC_IP_LOOKUP_TIMEOUT_MS);
    const response = await fetch(PUBLIC_IP_LOOKUP_URL, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn(`Public IP lookup returned status ${response.status}`);
      return undefined;
    }

    const body = (await response.json()) as { ip?: unknown };
    const ipAddress = typeof body.ip === "string" ? body.ip : undefined;

    if (!ipAddress || isIP(ipAddress) === 0) {
      logger.warn(`Public IP lookup returned invalid payload: ${JSON.stringify(body)}`);
      return undefined;
    }

    cachedHostPublicIp = { expiresAt: now + PUBLIC_IP_CACHE_TTL_MS, value: ipAddress };
    return ipAddress;
  } catch (error) {
    logger.warn(`Public IP lookup failed: ${(error as Error).message}`);
    return undefined;
  }
}

export function normalizeClientIp(ipAddress: string | undefined): string | undefined {
  const trimmedIpAddress = ipAddress?.trim();

  if (!trimmedIpAddress) {
    return undefined;
  }

  if (trimmedIpAddress === "::1") {
    return "127.0.0.1";
  }

  if (trimmedIpAddress.toLowerCase().startsWith(IPV4_MAPPED_IPV6_PREFIX)) {
    const mappedIpv4Address = trimmedIpAddress.slice(IPV4_MAPPED_IPV6_PREFIX.length);

    if (isIP(mappedIpv4Address) === 4) {
      return mappedIpv4Address;
    }
  }

  return trimmedIpAddress;
}

export async function enrichAdditionalDataWithClientIp(
  additionalData: RegisterRampRequest["additionalData"],
  request: RequestIpSource
): Promise<RegisterRampRequest["additionalData"]> {
  const providedIpAddress =
    typeof additionalData?.ipAddress === "string" ? normalizeClientIp(additionalData.ipAddress) : undefined;

  let resolvedIpAddress = providedIpAddress ?? normalizeClientIp(request.ip);

  if (config.deploymentEnv !== "production" && (!resolvedIpAddress || isLoopbackIp(resolvedIpAddress))) {
    const hostPublicIp = await fetchHostPublicIp();
    if (hostPublicIp) {
      resolvedIpAddress = hostPublicIp;
    }
  }

  return {
    ...(additionalData ?? {}),
    ipAddress: resolvedIpAddress
  };
}
