import { ApiManager, createEvmClientsAndConfig, EvmAddress, multiplyByPowerOfTen } from "@packages/shared";
import { moonbeam } from "@wagmi/core/chains";
import { privateKeyToAccount } from "viem/accounts";
import { MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS, MOONBEAM_FUNDING_PRIVATE_KEY } from "../../../../constants/constants";

export const fundMoonbeamEphemeralAccount = async (ephemeralAddress: string) => {
  try {
    const apiManager = ApiManager.getInstance();
    const apiData = await apiManager.getApi("moonbeam");

    const { walletClient, fundingAmountRaw, publicClient } = getMoonbeamFundingData(apiData.decimals);

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
    console.error("Error during funding Moonbeam ephemeral:", error);
    throw new Error("Error during funding Moonbeam ephemeral: " + error);
  }
};

export function getMoonbeamFundingData(decimals: number): {
  fundingAmountRaw: string;
  walletClient: ReturnType<typeof createEvmClientsAndConfig>["walletClient"];
  publicClient: ReturnType<typeof createEvmClientsAndConfig>["publicClient"];
} {
  const fundingAmountRaw = multiplyByPowerOfTen(MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS, decimals).toFixed();

  const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as EvmAddress);
  const { walletClient, publicClient } = createEvmClientsAndConfig(moonbeamExecutorAccount, moonbeam);

  return { fundingAmountRaw, publicClient, walletClient };
}
