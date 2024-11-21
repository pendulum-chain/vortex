import { FC } from 'react';
import { Modal } from 'react-daisyui';

interface SignInModalProps {
  signingPending: boolean;
  closeModal: () => void;
  handleSignIn: () => void;
}

export const SignInModal: FC<SignInModalProps> = ({ signingPending, closeModal, handleSignIn }) => {
  if (!signingPending) {
    return null;
  }

  return (
    <Modal open={signingPending} onClickBackdrop={closeModal}>
      <Modal.Header className="font-bold text-xl flex justify-between">
        Sign In
        <button onClick={closeModal} className="btn btn-sm btn-circle">
          ✕
        </button>
      </Modal.Header>
      <Modal.Body>
        <p>Please sign the message to log-in</p>
      </Modal.Body>
      <Modal.Actions className="justify-end">
        <button className="btn btn-primary" onClick={handleSignIn}>
          Sign Message
        </button>
        <button className="btn" onClick={closeModal}>
          Cancel
        </button>
      </Modal.Actions>
    </Modal>
  );
};
