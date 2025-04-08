import { sha256 } from 'ethers';
import { EvmAddress } from './brlaTeleportService';

export function verifyReferenceLabel(referenceLabel: string, receiverAddress: EvmAddress): boolean {
  return true; // TODO ONRAMP testing, remove.
  const referenceLabelClaimed = sha256(receiverAddress).toString().slice(0, 18);
  return referenceLabel === referenceLabelClaimed;
}

export function generateReferenceLabel(receiverAddress: EvmAddress): string {
  return sha256(receiverAddress).toString().slice(0, 18);
}
