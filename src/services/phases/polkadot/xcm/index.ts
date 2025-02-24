import { SubmittableExtrinsic } from '@polkadot/api-base/types';
import { parseEventXcmSent, XcmSentEvent } from '../eventParsers';
import { WalletAccount } from '@talismn/connect-wallets';
import { ISubmittableResult, Signer } from '@polkadot/types/types';

export const signAndSubmitXcm = async (
  walletAccount: WalletAccount,
  extrinsic: SubmittableExtrinsic<'promise'>,
  afterSignCallback: () => void,
): Promise<{ event: XcmSentEvent; hash: string }> => {
  return new Promise((resolve, reject) => {
    extrinsic
      .signAndSend(
        walletAccount.address,
        { signer: walletAccount.signer as Signer },
        (submissionResult: ISubmittableResult) => {
          const { status, events, dispatchError } = submissionResult;
          afterSignCallback();

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
        reject(new Error(`Failed to do XCM transfer: ${error}`));
      });
  });
};

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
