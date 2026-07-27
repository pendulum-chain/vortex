import { getAddress, isAddress } from "viem";
import { config } from "../../../config/vars";

interface PrivyLinkedAccount {
  id?: string;
  address?: string;
  type?: string;
  chain_type?: string;
  wallet_client_type?: string;
}

interface PrivyUserResponse {
  id: string;
  linked_accounts: PrivyLinkedAccount[];
}

export class PrivyWalletVerificationError extends Error {
  constructor(
    message: string,
    readonly kind: "disabled" | "not_found" | "ownership_mismatch" | "unavailable"
  ) {
    super(message);
    this.name = "PrivyWalletVerificationError";
  }
}

function isEmbeddedEvmWallet(account: PrivyLinkedAccount): boolean {
  return (
    account.type === "wallet" &&
    account.chain_type === "ethereum" &&
    (account.wallet_client_type === "privy" || account.wallet_client_type === "privy-v2") &&
    typeof account.address === "string" &&
    isAddress(account.address)
  );
}

export async function verifyPrivyWalletOwnership(input: {
  profileId: string;
  providerWalletId: string;
  address: string;
  signal?: AbortSignal;
}): Promise<{ address: string; privyUserId: string }> {
  if (!config.privy.walletRegistrationEnabled) {
    throw new PrivyWalletVerificationError("Privy wallet registration is disabled", "disabled");
  }

  const authorization = Buffer.from(`${config.privy.appId}:${config.privy.appSecret}`).toString("base64");
  let response: Response;
  try {
    response = await fetch("https://api.privy.io/v1/users/custom_auth/id", {
      body: JSON.stringify({ custom_user_id: input.profileId }),
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json",
        "privy-app-id": config.privy.appId
      },
      method: "POST",
      signal: input.signal ?? AbortSignal.timeout(10000)
    });
  } catch (error) {
    throw new PrivyWalletVerificationError(
      `Privy ownership verification failed: ${error instanceof Error ? error.message : String(error)}`,
      "unavailable"
    );
  }

  if (response.status === 404) {
    throw new PrivyWalletVerificationError("Privy user was not found for this Vortex profile", "not_found");
  }
  if (!response.ok) {
    throw new PrivyWalletVerificationError(`Privy ownership verification returned ${response.status}`, "unavailable");
  }

  const user = (await response.json()) as PrivyUserResponse;
  const requestedAddress = getAddress(input.address);
  const wallet = user.linked_accounts
    .filter(isEmbeddedEvmWallet)
    .find(account => account.id === input.providerWalletId && getAddress(account.address as string) === requestedAddress);

  if (!wallet) {
    throw new PrivyWalletVerificationError("The Privy wallet does not belong to this Vortex profile", "ownership_mismatch");
  }

  return { address: requestedAddress, privyUserId: user.id };
}
