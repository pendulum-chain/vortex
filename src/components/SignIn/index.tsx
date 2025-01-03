import { FC, useState } from 'preact/compat';
import { useEffect } from 'react';
import { Modal } from 'react-daisyui';

interface SignInModalProps {
  signingPending: boolean;
  closeModal: () => void;
  handleSignIn: () => void;
}

export const SignInModal: FC<SignInModalProps> = ({ signingPending, closeModal, handleSignIn }) => {
  const [waitingForWallet, setWaitingForWallet] = useState(false);

  const onSignMessage = () => {
    setWaitingForWallet(true);
    handleSignIn();
  };

  if (!signingPending) {
    return null;
  }

  // We reset the waiting state when the signing process is finished, or failed.
  useEffect(() => {
    setWaitingForWallet(false);
  }, [signingPending]);

  return (
    <Modal open={signingPending} onClickBackdrop={closeModal}>
      <Modal.Header className="flex justify-between text-xl font-bold">
        Sign In
        <button onClick={closeModal} className="btn btn-sm btn-circle">
          ✕
        </button>
      </Modal.Header>
      <Modal.Body>
        {waitingForWallet ? (
          <div className="mt-4 text-center text-sm text-gray-500">
            Proceed to your wallet to complete the signing process.
          </div>
        ) : (
          <p>Please sign the message to log in.</p>
        )}
      </Modal.Body>
      <Modal.Actions className="justify-end">
        <button
          className={`btn btn-primary flex items-center justify-center gap-2`}
          onClick={onSignMessage}
          disabled={waitingForWallet}
        >
          {waitingForWallet && (
            <div
              className="spinner-border animate-spin inline-block w-4 h-4 border-2 rounded-full text-white border-t-transparent"
              role="status"
            ></div>
          )}
          {waitingForWallet ? 'Awaiting Wallet' : 'Sign Message'}
        </button>
        <button className="btn" onClick={closeModal}>
          Cancel
        </button>
      </Modal.Actions>
    </Modal>
  );
};
