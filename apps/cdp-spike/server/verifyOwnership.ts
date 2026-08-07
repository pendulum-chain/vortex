import { getAddress } from "viem";

interface CdpAuthenticationMethod {
  sub?: string;
  type: string;
}

interface CdpEndUser {
  authenticationMethods: CdpAuthenticationMethod[];
  evmAccountObjects: Array<{ address: string }>;
  userId: string;
}

interface VerifyOwnershipInput {
  accessToken: string;
  address: string;
  cdpProjectId: string;
  cdpUserId: string;
  vortexApiUrl: string;
}

export interface OwnershipEvidence {
  address: string;
  cdpUserId: string;
  supabaseSubject: string;
}

export async function verifyCdpOwnership(
  input: VerifyOwnershipInput,
  fetchImplementation: typeof fetch = fetch
): Promise<OwnershipEvidence> {
  const vortexResponse = await fetchImplementation(`${input.vortexApiUrl.replace(/\/$/, "")}/v1/auth/verify`, {
    body: JSON.stringify({ access_token: input.accessToken }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  if (!vortexResponse.ok) {
    throw new Error(`Vortex rejected the Supabase token (${vortexResponse.status})`);
  }

  const vortexIdentity = (await vortexResponse.json()) as { user_id?: string; valid?: boolean };
  if (!vortexIdentity.valid || !vortexIdentity.user_id) {
    throw new Error("Vortex did not return a valid Supabase subject");
  }

  const cdpUrl = new URL(
    `/platform/v2/embedded-wallet-api/end-users/${encodeURIComponent(input.cdpUserId)}`,
    "https://api.cdp.coinbase.com"
  );
  cdpUrl.searchParams.set("projectID", input.cdpProjectId);
  const cdpResponse = await fetchImplementation(cdpUrl, {
    headers: { Authorization: `Bearer ${input.accessToken}` }
  });
  if (!cdpResponse.ok) {
    throw new Error(`CDP rejected the ownership lookup (${cdpResponse.status})`);
  }

  const cdpUser = (await cdpResponse.json()) as CdpEndUser;
  const jwtIdentity = cdpUser.authenticationMethods.find(method => method.type === "jwt");
  if (cdpUser.userId !== input.cdpUserId || jwtIdentity?.sub !== vortexIdentity.user_id) {
    throw new Error("CDP user is not bound to the authenticated Supabase subject");
  }

  const requestedAddress = getAddress(input.address);
  const ownsAddress = cdpUser.evmAccountObjects.some(account => getAddress(account.address) === requestedAddress);
  if (!ownsAddress) {
    throw new Error("CDP user does not own the requested EVM account");
  }

  return {
    address: requestedAddress,
    cdpUserId: cdpUser.userId,
    supabaseSubject: vortexIdentity.user_id
  };
}
