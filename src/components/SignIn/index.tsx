import React from 'react';
import { useAccount } from 'wagmi';
import { useSignChallenge } from '../../hooks/useSignChallenge';
import { Modal } from 'react-daisyui';

export function SignInModal() {
  const { address } = useAccount();
  console.log('address:', address);

  const { isModalOpen, handleSiweSignIn, closeModal } = useSignChallenge(address);

  if (!isModalOpen) {
    return null;
  }

  return (
    <Modal open={isModalOpen} onClickBackdrop={closeModal}>
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
        <button className="btn btn-primary" onClick={handleSiweSignIn}>
          Sign Message
        </button>
        <button className="btn" onClick={closeModal}>
          Cancel
        </button>
      </Modal.Actions>
    </Modal>
  );
}
