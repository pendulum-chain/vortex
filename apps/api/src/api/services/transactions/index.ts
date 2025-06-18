import type { PresignedTx } from "@packages/shared";
import httpStatus from "http-status";
import { APIError } from "../../errors/api-error";

export function encodeEvmTransactionData(data: unknown) {
  // We don't need to stringify this and can just return the plain JSON
  return data;
}

export function validatePresignedTxs(presignedTxs: PresignedTx[]): void {
  if (!Array.isArray(presignedTxs) || presignedTxs.length < 1 || presignedTxs.length > 100) {
    throw new APIError({
      message: "presignedTxs must be an array with 1-10 elements",
      status: httpStatus.BAD_REQUEST
    });
  }

  for (const tx of presignedTxs) {
    if (!tx.txData || !tx.phase || !tx.network || tx.nonce === undefined || !tx.signer) {
      throw new APIError({
        message: "Each transaction must have txData, phase, network, nonce and signer properties",
        status: httpStatus.BAD_REQUEST
      });
    }
  }
}
