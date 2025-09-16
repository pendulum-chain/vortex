import { AXL_USDC_MOONBEAM, createMoonbeamToAssethubTransfer, RampPhase } from "@packages/shared";
import { Keyring } from "@polkadot/api";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class MoonbeamXcmToAssethubPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "moonbeamXcmToAssethub";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { moonbeamEphemeralAccount, finalUserAddress, inputAmount } = state.state as StateMetadata;

    if (!moonbeamEphemeralAccount || !finalUserAddress) {
      throw new Error("MoonbeamXcmToAssethubPhaseHandler: State metadata corrupted. This is a bug.");
    }

    logger.info({
      message: "MoonbeamXcmToAssethubPhaseHandler: Starting XCM transfer from Moonbeam to AssetHub.",
      rampId: state.id
    });

    // The asset is xcUSDC, which has 6 decimals on Moonbeam
    const amountInBaseUnit = BigInt(parseFloat(inputAmount) * 10 ** 6);

    const transferExtrinsic = await createMoonbeamToAssethubTransfer(
      finalUserAddress,
      amountInBaseUnit.toString(),
      AXL_USDC_MOONBEAM
    );

    const keyring = new Keyring({ type: "sr25519" });
    const moonbeamAccount = keyring.addFromUri(moonbeamEphemeralAccount.secret);

    await transferExtrinsic.signAndSend(moonbeamAccount);

    logger.info({
      message: "MoonbeamXcmToAssethubPhaseHandler: XCM transfer successful.",
      rampId: state.id
    });

    return this.transitionToNextPhase(state, "complete");
  }
}

export default new MoonbeamXcmToAssethubPhaseHandler();
