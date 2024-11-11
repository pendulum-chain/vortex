import { FC } from 'react';
import { useAccount } from 'wagmi';
import { Modal } from 'react-daisyui';

interface SignInModalProps {
  requiresSign: boolean;
  closeModal: any;
  handleSignIn: any;
}

export const SignInModal: FC<SignInModalProps> = ({ requiresSign, closeModal, handleSignIn }) => {
  const { address } = useAccount();
  console.log('address:', address);

  if (!requiresSign) {
    return null;
  }

  return (
    <Modal open={requiresSign} onClickBackdrop={closeModal}>
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
