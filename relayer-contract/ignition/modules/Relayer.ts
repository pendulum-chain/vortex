import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "hardhat";

const RELAYER_NAME = "TokenRelayer";

export default buildModule(RELAYER_NAME, m => {
  const destinationContract = "0xce16F69375520ab01377ce7B88f5BA8C48F8D666";

  const relayer = m.contract("TokenRelayer", [destinationContract]);

  return { relayer };
});
