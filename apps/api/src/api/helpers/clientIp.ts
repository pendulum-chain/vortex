import { isIP } from "node:net";
import { RegisterRampRequest } from "@vortexfi/shared";

const IPV4_MAPPED_IPV6_PREFIX = "::ffff:";

interface RequestIpSource {
  ip?: string;
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

export function enrichAdditionalDataWithClientIp(
  additionalData: RegisterRampRequest["additionalData"],
  request: RequestIpSource
): RegisterRampRequest["additionalData"] {
  const providedIpAddress =
    typeof additionalData?.ipAddress === "string" ? normalizeClientIp(additionalData.ipAddress) : undefined;

  return {
    ...(additionalData ?? {}),
    ipAddress: providedIpAddress ?? normalizeClientIp(request.ip)
  };
}
