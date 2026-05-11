import { ApiManager, EvmClientManager, multiplyByPowerOfTen, Networks } from "@vortexfi/shared";
import logger from "../../../../config/logger";
import { MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS } from "../../../../constants/constants";
import { getEvmFundingAccount } from "../../phases/evm-funding";

export const fundMoonbeamEphemeralAccount = async (ephemeralAddress: string) => {
  try {
    const apiManager = ApiManager.getInstance();
    const apiData = await apiManager.getApi("moonbeam");

    const fundingAmountRaw = multiplyByPowerOfTen(MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS, apiData.decimals).toFixed();

    const moonbeamExecutorAccount = getEvmFundingAccount(Networks.Moonbeam);
    const evmClientManager = EvmClientManager.getInstance();
    const publicClient = evmClientManager.getClient(Networks.Moonbeam);
    const walletClient = evmClientManager.getWalletClient(Networks.Moonbeam, moonbeamExecutorAccount);

    const txHash = await walletClient.sendTransaction({
      to: ephemeralAddress as `0x${string}`,
      value: BigInt(fundingAmountRaw)
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`
    });
    if (!receipt || receipt.status !== "success") {
      throw new Error(`fundMoonbeamEphemeralAccount: Transaction ${txHash} failed or was not found`);
    }
  } catch (error) {
    logger.error("Error during funding Moonbeam ephemeral:", error);
    throw new Error("Error during funding Moonbeam ephemeral: " + error);
  }
};
