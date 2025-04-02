import { Extrinsic } from '@pendulum-chain/api-solang';
import { ApiPromise } from '@polkadot/api';
import httpStatus from 'http-status';
import { PresignedTx } from 'shared';
import { APIError } from '../../errors/api-error';

export function encodeSubmittableExtrinsic(extrinsic: Extrinsic) {
  return extrinsic.toHex();
}

export function decodeSubmittableExtrinsic(encodedExtrinsic: string, api: ApiPromise) {
  return api.tx(encodedExtrinsic);
}

export function encodeEvmTransactionData(data: unknown) {
  return JSON.stringify(data);
}

export function validatePresignedTxs(presignedTxs: PresignedTx[]): void {
  console.log('Validating presigned transactions...', presignedTxs, presignedTxs.length);
  if (!Array.isArray(presignedTxs) || presignedTxs.length < 1 || presignedTxs.length > 5) {
    throw new APIError({
      status: httpStatus.BAD_REQUEST,
      message: 'presignedTxs must be an array with 1-5 elements',
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
