import { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../config/logger";
import { config } from "../../config/vars";

interface StatusResponse {
  status: boolean;
  public: Address | undefined;
}

export const sendStatusWithPk = async (): Promise<StatusResponse> => {
  let moonbeamExecutorAccount;

  try {
    moonbeamExecutorAccount = privateKeyToAccount(config.secrets.moonbeamExecutorPrivateKey as `0x${string}`);
    return { public: moonbeamExecutorAccount.address, status: false };
  } catch (error) {
    logger.error("Error deriving Moonbeam executor address:", error);
    return { public: moonbeamExecutorAccount?.address, status: false };
  }
};
