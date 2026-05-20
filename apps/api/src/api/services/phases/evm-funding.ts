import { EvmNetworks } from "@vortexfi/shared";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { EVM_FUNDING_PRIVATE_KEY } from "../../../config/vars";

let cachedAccount: PrivateKeyAccount | undefined;

export function getEvmFundingAccount(_network: EvmNetworks): PrivateKeyAccount {
  if (!EVM_FUNDING_PRIVATE_KEY) {
    throw new Error(
      "EVM_FUNDING_PRIVATE_KEY is not configured (and no MOONBEAM_EXECUTOR_PRIVATE_KEY fallback). Cannot derive EVM funding account."
    );
  }
  if (!cachedAccount) {
    cachedAccount = privateKeyToAccount(EVM_FUNDING_PRIVATE_KEY as `0x${string}`);
  }
  return cachedAccount;
}
