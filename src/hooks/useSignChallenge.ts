import { useEffect, useState, useCallback } from 'react';
import { useSignMessage } from 'wagmi';
import { SIGNING_SERVICE_URL } from '../constants/constants';

export function useSignChallenge(address: `0x${string}` | undefined) {
  const { signMessageAsync } = useSignMessage();

  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSiweSignIn = useCallback(async () => {
    try {
      const response = await fetch(`${SIGNING_SERVICE_URL}/v1/siwe/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress: address }),
      });
      const { siweMessage, nonce } = await response.json();
      console.log('SIWE message:', siweMessage, 'nonce:', nonce);
      const signature = await signMessageAsync({ message: siweMessage });

      console.log('SIWE signature:', signature);
      localStorage.setItem(`siwe-signature-${address}`, JSON.stringify({ nonce, signature }));

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
