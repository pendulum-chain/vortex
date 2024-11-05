import { useEffect, useState, useCallback } from 'react';
import { useSignMessage } from 'wagmi';

export function useSignChallenge(address: `0x${string}` | undefined) {
  const { signMessageAsync } = useSignMessage();

  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSiweSignIn = useCallback(async () => {
    try {
      // const response = await fetch('/api/siwe-challenge');
      // const { message } = await response.json();
      const message = 'Please sign the message to log in';
      const signature = await signMessageAsync({ message });

      console.log('SIWE signature:', signature);

      localStorage.setItem(`siwe-signature-${address}`, signature);

      setIsModalOpen(false);
    } catch (error) {
      console.error('Error during SIWE sign-in:', error);
    }
  }, [address, signMessageAsync]);

  useEffect(() => {
    if (!address) {
      return;
    }

    const storedSignature = localStorage.getItem(`siwe-signature-${address}`);
    console.log('Stored SIWE signature:', storedSignature);
    if (!storedSignature) {
      setIsModalOpen(true);
      console.log('Opening SIWE sign-in modal');
    } else {
      setIsModalOpen(false);
    }
  }, [address]);

  return {
    isModalOpen,
    handleSiweSignIn,
    closeModal: () => setIsModalOpen(false),
  };
}
