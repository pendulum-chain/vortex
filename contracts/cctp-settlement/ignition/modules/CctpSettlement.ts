import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const CCTP_SETTLEMENT_MODULE_NAME = "CctpSettlement";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_TOKEN_MESSENGER_V2 = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function addressToBytes32Parameter(address: string) {
  return `0x${address.replace(/^0x/, "").padStart(64, "0")}`;
}

export default buildModule(CCTP_SETTLEMENT_MODULE_NAME, m => {
  const usdc = m.getParameter("usdc", process.env.USDC_ADDRESS || BASE_USDC);
  const tokenMessenger = m.getParameter("tokenMessenger", process.env.TOKEN_MESSENGER_V2_ADDRESS || BASE_TOKEN_MESSENGER_V2);
  if (!process.env.ETHEREUM_MINT_RECIPIENT) {
    throw new Error("ETHEREUM_MINT_RECIPIENT must be set before deploying CctpSettlement");
  }

  const ethereumMintRecipient = m.getParameter("ethereumMintRecipient", process.env.ETHEREUM_MINT_RECIPIENT);
  const destinationCallerAddress = process.env.DESTINATION_CALLER || ZERO_ADDRESS;
  const destinationCaller = m.getParameter("destinationCaller", addressToBytes32Parameter(destinationCallerAddress));

  const factory = m.contract("PerUserCctpSettlementFactory", [usdc, tokenMessenger]);
  const settlement = m.contract("PerUserCctpSettlement", [usdc, tokenMessenger, ethereumMintRecipient, destinationCaller]);

  return { factory, settlement };
});
