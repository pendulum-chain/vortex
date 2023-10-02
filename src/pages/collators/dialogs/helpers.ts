import { ApiPromise } from '@polkadot/api';
import { SubmittableExtrinsic } from '@polkadot/api/promise/types';
import { WalletAccount } from '@talismn/connect-wallets';
import { StateUpdater } from 'preact/hooks';
import { toast } from 'react-toastify';
import { getErrors } from '../../../helpers/substrate';

export const doSubmitExtrinsic = (
  api: ApiPromise,
  extrinsic: SubmittableExtrinsic | undefined,
  walletAccount: WalletAccount,
  setSubmissionPending: StateUpdater<boolean>,
  setConfirmationDialogVisible: StateUpdater<boolean>,
) => {
  setSubmissionPending(true);

  extrinsic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ?.signAndSend(walletAccount.address, { signer: walletAccount.signer as any }, (result) => {
      const { status, events } = result;

      const errors = getErrors(events, api);
      if (status.isInBlock) {
        if (errors.length > 0) {
          const errorMessage = `Transaction failed with errors: ${errors.join('\n')}`;
          console.error(errorMessage);
          toast(errorMessage, { type: 'error' });
        }
      } else if (status.isFinalized) {
        setSubmissionPending(false);

        if (errors.length === 0) {
          setConfirmationDialogVisible(true);
        }
      }
    })
    .catch((error) => {
      console.error('Transaction submission failed', error);
      toast('Transaction submission failed', { type: 'error' });
      setSubmissionPending(false);
    });
};
