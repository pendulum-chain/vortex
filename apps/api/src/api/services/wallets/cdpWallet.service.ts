import { getAddress, isAddress } from "viem";
import { config } from "../../../config/vars";

interface CdpAuthenticationMethod {
  sub?: string;
  type: string;
}

interface CdpEvmAccount {
  address?: string;
}

interface CdpEndUserResponse {
  authenticationMethods: CdpAuthenticationMethod[];
  evmAccountObjects: CdpEvmAccount[];
  userId: string;
}

export class CdpWalletVerificationError extends Error {
  constructor(
    message: string,
    readonly kind: "disabled" | "not_found" | "ownership_mismatch" | "unavailable"
  ) {
    super(message);
    this.name = "CdpWalletVerificationError";
  }
}

function isEvmAccount(account: CdpEvmAccount): account is { address: string } {
  return typeof account.address === "string" && isAddress(account.address);
}

export async function verifyCdpWalletOwnership(input: {
  accessToken: string;
  cdpUserId: string;
  profileId: string;
  address: string;
  signal?: AbortSignal;
}): Promise<{ address: string; cdpUserId: string }> {
  if (!config.cdp.walletRegistrationEnabled) {
    throw new CdpWalletVerificationError("CDP wallet registration is disabled", "disabled");
  }

  let response: Response;
  try {
    const userId = encodeURIComponent(input.cdpUserId);
    const projectId = encodeURIComponent(config.cdp.projectId);
    response = await fetch(
      `https://api.cdp.coinbase.com/platform/v2/embedded-wallet-api/end-users/${userId}?projectID=${projectId}`,
      {
        headers: {
          Authorization: `Bearer ${input.accessToken}`
        },
        signal: input.signal ?? AbortSignal.timeout(10000)
      }
    );
  } catch (error) {
    throw new CdpWalletVerificationError(
      `CDP ownership verification failed: ${error instanceof Error ? error.message : String(error)}`,
      "unavailable"
    );
  }

  if (response.status === 404) {
    throw new CdpWalletVerificationError("CDP user was not found", "not_found");
  }
  if (!response.ok) {
    throw new CdpWalletVerificationError(`CDP ownership verification returned ${response.status}`, "unavailable");
  }

  const user = (await response.json()) as CdpEndUserResponse;
  const requestedAddress = getAddress(input.address);
  const jwtIdentity = user.authenticationMethods.find(method => method.type === "jwt");
  const ownsAddress = user.evmAccountObjects
    .filter(isEvmAccount)
    .some(account => getAddress(account.address) === requestedAddress);

  if (user.userId !== input.cdpUserId || jwtIdentity?.sub !== input.profileId || !ownsAddress) {
    throw new CdpWalletVerificationError("The CDP wallet does not belong to this Vortex profile", "ownership_mismatch");
  }

  return { address: requestedAddress, cdpUserId: user.userId };
}
