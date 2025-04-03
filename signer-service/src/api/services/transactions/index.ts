import httpStatus from 'http-status';
import { PresignedTx } from 'shared';
import { APIError } from '../../errors/api-error';

export function encodeEvmTransactionData(data: unknown) {
  // We don't need to stringify this and can just return the plain JSON
  return data;
}

export function validatePresignedTxs(presignedTxs: PresignedTx[]): void {
  console.log('Validating presigned transactions...', presignedTxs, presignedTxs.length);
  if (!Array.isArray(presignedTxs) || presignedTxs.length < 1 || presignedTxs.length > 10) {
    throw new APIError({
      status: httpStatus.BAD_REQUEST,
      message: 'presignedTxs must be an array with 1-10 elements',
    });
  }

  for (const tx of presignedTxs) {
    if (!tx.tx_data || !tx.phase || !tx.network || tx.nonce === undefined || !tx.signer) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Each transaction must have tx_data, phase, network, nonce and signer properties',
      });
    }
  }
}
