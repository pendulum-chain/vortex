import { SubmittableExtrinsic } from '@polkadot/api-base/types';
import { parseEventMoonbeamXcmSent, parseEventXcmSent, parseEventXTokens, XcmSentEvent, XTokensEvent } from 'shared';
import { ISubmittableResult, Signer } from '@polkadot/types/types';
import { ApiPromise } from '@polkadot/api';
import { SignedBlock } from '@polkadot/types/interfaces';

export class TransactionInclusionError extends Error {
  public readonly blockHash: string;

  constructor(blockHash: string, extrinsicHash: string, message?: string) {
    super(message);
    this.blockHash = blockHash;
    Object.setPrototypeOf(this, TransactionInclusionError.prototype);
  }
}

async function waitForBlock(api: ApiPromise, blockHash: string, timeoutMs = 60000): Promise<SignedBlock> {
  const pollIntervalMs = 1000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const block = await api.rpc.chain.getBlock(blockHash);

      if (block) {
        return block;
      }
    } catch (error) {
      console.log(error);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Block ${blockHash} not found after ${timeoutMs}ms`);
}

export async function verifyXcmSentEvent(
  api: ApiPromise,
  blockHash: string,
  address: string,
): Promise<{ event: XcmSentEvent; hash: string }> {
  try {
    await waitForBlock(api, blockHash);
  } catch {
    throw new Error(`Block ${blockHash} not found`);
  }

  const apiAt = await api.at(blockHash);
  const events = await apiAt.query.system.events();

  const xcmSentEvent = events
    .filter((record) => record.event.section === 'polkadotXcm' && record.event.method === 'Sent') // TODO why is this broken?? filter method not part of codec?
    .map(parseEventXcmSent)
    .find((event) => event.originAddress === address);

  if (!xcmSentEvent) {
    throw new Error(`No XcmSent event found for account ${address}`);
  }

  return { event: xcmSentEvent, hash: blockHash };
}

export const submitXcm = async (
  address: string,
  extrinsic: SubmittableExtrinsic<'promise'>,
): Promise<{ event: XcmSentEvent; hash: string }> =>
  new Promise((resolve, reject) => {
    extrinsic
      .send((submissionResult: ISubmittableResult) => {
        const { status, events, dispatchError } = submissionResult;

        if (status.isFinalized) {
          const hash = status.asFinalized.toString();

          // Try to find a 'system.ExtrinsicFailed' event
          if (dispatchError) {
            reject('Xcm transaction failed');
          }

          // Try to find 'polkadotXcm.Sent' events
          const xcmSentEvents = events.filter(
            (record) => record.event.section === 'polkadotXcm' && record.event.method === 'Sent',
          );

          const event = xcmSentEvents
            .map((event) => parseEventXcmSent(event))
            .filter((event) => event.originAddress == address);

          if (event.length == 0) {
            reject(new Error(`No XcmSent event found for account ${address}`));
          }
          resolve({ event: event[0], hash });
        }
      })
      .catch((error) => {
        reject(new Error(`Failed to do XCM transfer: ${error}`));
      });
  });

export const submitMoonbeamXcm = async (
  address: string,
  extrinsic: SubmittableExtrinsic<'promise'>,
): Promise<{ event: XcmSentEvent; hash: string }> =>
  new Promise((resolve, reject) => {
    extrinsic
      .send((submissionResult: ISubmittableResult) => {
        const { status, events, dispatchError } = submissionResult;

        if (status.isFinalized) {
          const hash = status.asFinalized.toString();

          // Try to find a 'system.ExtrinsicFailed' event
          if (dispatchError) {
            reject('Xcm transaction failed');
          }

          // Try to find 'polkadotXcm.Sent' events
          const xcmSentEvents = events.filter(
            (record) => record.event.section === 'polkadotXcm' && record.event.method === 'Sent',
          );
          const event = xcmSentEvents
            .map((event) => parseEventMoonbeamXcmSent(event))
            .filter((event) => event.originAddress == address);

          if (!event) {
            reject(new Error(`No XcmSent event found for account ${address}`));
          }
          resolve({ event: event[0], hash });
        }
      })
      .catch((error) => {
        reject(new Error(`Failed to do XCM transfer: ${error}`));
      });
  });

export const submitXTokens = async (
  address: string,
  extrinsic: SubmittableExtrinsic<'promise'>,
): Promise<{ event: XTokensEvent; hash: string }> =>
  new Promise((resolve, reject) => {
    extrinsic
      .send((submissionResult: ISubmittableResult) => {
        const { status, events, dispatchError } = submissionResult;

        if (status.isFinalized) {
          const hash = status.asFinalized.toString();

          // Try to find a 'system.ExtrinsicFailed' event
          if (dispatchError) {
            reject('Xcm transaction failed');
          }

          // Try to find 'xTokens.TransferredMultiAssets' events
          const xTokenEvents = events.filter(
            (record) => record.event.section === 'xTokens' && record.event.method === 'TransferredMultiAssets',
          );

          const event = xTokenEvents
            .map((event) => parseEventXTokens(event))
            .filter((event) => event.sender == address);

          if (event.length == 0) {
            reject(new Error(`No XcmSent event found for account ${address}`));
          }
          resolve({ event: event[0], hash });
        }
      })
      .catch((error) => {
        reject(new Error(`Failed to do XCM transfer: ${error}`));
      });
  });
