import { EvmClientManager, EvmNetworks, isEvmTransactionData, RampPhase, UnsignedTx } from "@vortexfi/shared";
import RampState from "../../../../models/rampState.model";
import { RecoverablePhaseError, UnrecoverablePhaseError } from "../../../errors/phase-error";

// Reads the unsigned blueprint from state.unsignedTxs — NOT state.presignedTxs. For user-wallet
// phases the presignedTxs path is rejected by validation, so the blueprint is the only source of
// truth for what we asked the user to broadcast.
function getUserBlueprint(state: RampState, phase: RampPhase): UnsignedTx {
  const blueprint = state.unsignedTxs.find(tx => tx.phase === phase);
  if (!blueprint) {
    throw new UnrecoverablePhaseError(`No unsigned blueprint found for user-wallet phase ${phase}`);
  }
  if (!isEvmTransactionData(blueprint.txData)) {
    throw new UnrecoverablePhaseError(`Unsigned blueprint for phase ${phase} is not an EVM transaction`);
  }
  return blueprint;
}

interface VerifyUserSubmittedTxOptions {
  state: RampState;
  hash: `0x${string}` | undefined;
  fromNetwork: EvmNetworks;
  label: string;
  presignedPhase: RampPhase;
}

// Cross-checks an integrator-reported on-chain tx hash against the unsigned blueprint we issued
// at registration. A field mismatch is unrecoverable — spending ephemeral funds on a tx that
// doesn't match the blueprint would let an attacker point us at an arbitrary tx and drain funds.
export async function verifyUserSubmittedTxByHash({
  state,
  hash,
  fromNetwork,
  label,
  presignedPhase
}: VerifyUserSubmittedTxOptions): Promise<void> {
  if (!hash) {
    throw new RecoverablePhaseError(`${label} hash not yet reported by frontend`);
  }

  const blueprint = getUserBlueprint(state, presignedPhase);
  const blueprintTxData = blueprint.txData as { to: string; data: string; value: string };
  const expectedFrom = blueprint.signer.toLowerCase();
  const expectedTo = blueprintTxData.to.toLowerCase();
  const expectedData = blueprintTxData.data.toLowerCase();
  const expectedValue = BigInt(blueprintTxData.value ?? "0");

  const publicClient = EvmClientManager.getInstance().getClient(fromNetwork);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt || receipt.status !== "success") {
    throw new RecoverablePhaseError(`${label} tx failed: ${hash}`);
  }

  if (receipt.from.toLowerCase() !== expectedFrom) {
    throw new UnrecoverablePhaseError(`${label} tx ${hash} was sent by ${receipt.from}, expected ${expectedFrom}`);
  }
  if (!receipt.to || receipt.to.toLowerCase() !== expectedTo) {
    throw new UnrecoverablePhaseError(
      `${label} tx ${hash} was sent to ${receipt.to ?? "<contract creation>"}, expected ${expectedTo}`
    );
  }

  const tx = await publicClient.getTransaction({ hash });
  if (tx.input.toLowerCase() !== expectedData) {
    throw new UnrecoverablePhaseError(`${label} tx ${hash} calldata does not match presigned payload`);
  }
  if (BigInt(tx.value) !== expectedValue) {
    throw new UnrecoverablePhaseError(
      `${label} tx ${hash} value ${tx.value.toString()} does not match expected ${expectedValue.toString()}`
    );
  }
}
