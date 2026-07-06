import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const CCTP_SETTLEMENT_MODULE_NAME = "CctpSettlement";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_TOKEN_MESSENGER_V2 = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";

export default buildModule(CCTP_SETTLEMENT_MODULE_NAME, m => {
  const usdc = m.getParameter("usdc", process.env.USDC_ADDRESS || BASE_USDC);
  const tokenMessenger = m.getParameter("tokenMessenger", process.env.TOKEN_MESSENGER_V2_ADDRESS || BASE_TOKEN_MESSENGER_V2);

  const factory = m.contract("PerUserCctpSettlementFactory", [usdc, tokenMessenger]);

  return { factory };
});
