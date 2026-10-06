import { Keyring } from "@polkadot/api";
import { config } from "../../config/vars";

export const getFundingAccount = () => {
  if (!config.secrets.pendulumFundingSeed) {
    throw new Error("PENDULUM_FUNDING_SEED is not configured");
  }

  const keyring = new Keyring({ type: "sr25519" });
  return keyring.addFromUri(config.secrets.pendulumFundingSeed);
};
