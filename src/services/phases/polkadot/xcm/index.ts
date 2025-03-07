import { SubmittableExtrinsic } from '@polkadot/api-base/types';
import { parseEventXcmSent, XcmSentEvent } from '../eventParsers';
import { WalletAccount } from '@talismn/connect-wallets';
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

export const signAndSubmitXcm = async (
  walletAccount: WalletAccount,
  extrinsic: SubmittableExtrinsic<'promise'>,
  afterSignCallback: () => void,
): Promise<{ event: XcmSentEvent; hash: string }> => {
  return new Promise((resolve, reject) => {
    let inBlockHash: string | null = null;

    extrinsic
      .signAndSend(
        walletAccount.address,
        { signer: walletAccount.signer as Signer },
        (submissionResult: ISubmittableResult) => {
          const { status, events, dispatchError } = submissionResult;
          afterSignCallback();

          if (status.isInBlock && !inBlockHash) {
            inBlockHash = status.asInBlock.toString();
          }

          if (status.isFinalized) {
            const hash = status.asFinalized.toString();

            // Try to find a 'system.ExtrinsicFailed' event
            if (dispatchError) {
              reject('Xcm transaction failed');
            }

            // Try to find 'polkadotXcm.Sent' events
            const xcmSentEvents = events.filter((record) => {
              return record.event.section === 'polkadotXcm' && record.event.method === 'Sent';
            });

            const event = xcmSentEvents
              .map((event) => parseEventXcmSent(event))
              .filter((event) => {
                return event.originAddress == walletAccount.address;
              });

            if (event.length == 0) {
              reject(new Error(`No XcmSent event found for account ${walletAccount.address}`));
            }
            resolve({ event: event[0], hash });
          }
        },
      )
      .catch((error) => {
        afterSignCallback();
        if (inBlockHash) {
          return reject(
            new TransactionInclusionError(
              inBlockHash,
              `Transaction may have been included in block ${inBlockHash} despite error: ${error}`,
            ),
          );
        }

        reject(new Error(`Failed to do XCM transfer: ${error}`));
      });
  });
};

const MAX_RETRIES = 120;
const RETRY_DELAY_MS = 1000;
async function waitForBlock(api: ApiPromise, blockHash: string, retries = MAX_RETRIES): Promise<SignedBlock> {
  try {
    const block = await api.rpc.chain.getBlock(blockHash);
    if (block) {
      return block;
    }
  } catch (error) {
    console.log(error);
  }

  if (retries <= 0) {
    throw new Error(`Block ${blockHash} not found after ${MAX_RETRIES} attempts`);
  }

  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  return waitForBlock(api, blockHash, retries - 1);
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
    .filter((record) => record.event.section === 'polkadotXcm' && record.event.method === 'Sent')
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
): Promise<{ event: XcmSentEvent; hash: string }> => {
  return new Promise((resolve, reject) => {
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
          const xcmSentEvents = events.filter((record) => {
            return record.event.section === 'polkadotXcm' && record.event.method === 'Sent';
          });

          const event = xcmSentEvents
            .map((event) => parseEventXcmSent(event))
            .filter((event) => {
              return event.originAddress == address;
            });

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
};
