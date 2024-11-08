import { useEffect, useState, useCallback } from 'react';
import { useSignMessage } from 'wagmi';
import { SIGNING_SERVICE_URL } from '../constants/constants';
import { storageKeys } from '../constants/localStorage';
import { SiweMessage } from 'siwe';

type SiweSignatureData = {
  nonce: string;
  signature: string;
  expirationDate: string;
};

export function useGetOrRefreshSiweSignature(address: `0x${string}` | undefined) {
  const { signMessageAsync } = useSignMessage();
  const [signatureData, setSignatureData] = useState<SiweSignatureData | null>(null);

  const getOrRefreshSiweSignature = useCallback(async (): Promise<SiweSignatureData | undefined> => {
    if (!address) {
      return;
    }

    const storageKey = `${storageKeys.SIWE_SIGNATURE_KEY_PREFIX}${address}`;
    const maybeStoredSignatureData = localStorage.getItem(storageKey);

    if (maybeStoredSignatureData) {
      const storedSignatureData: SiweSignatureData = JSON.parse(maybeStoredSignatureData);
      const expirationDate = new Date(storedSignatureData.expirationDate);

      if (expirationDate > new Date()) {
        // Signature is still valid
        setSignatureData(storedSignatureData);
        return storedSignatureData;
      } else {
        // Signature expired, remove it
        localStorage.removeItem(storageKey);
      }
    }

    // Signature not found or expired, fetch a new one
    try {
      const response = await fetch(`${SIGNING_SERVICE_URL}/v1/siwe/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress: address }),
      });

      const { siweMessage, nonce } = await response.json();

      // Parse the SIWE message to extract the expiration date
      const message = new SiweMessage(siweMessage);
      const expirationDate = message.expirationTime!;

      const signature = await signMessageAsync({ message: siweMessage });

      const newSignatureData: SiweSignatureData = {
        nonce,
        signature,
        expirationDate,
      };

      localStorage.setItem(storageKey, JSON.stringify(newSignatureData));
      setSignatureData(newSignatureData);
      return newSignatureData;
    } catch (error) {
      console.error('Error during SIWE sign-in:', error);
    }
  }, [address, signMessageAsync]);

  return { signatureData, getOrRefreshSiweSignature };
}

export function useSignChallenge(address: `0x${string}` | undefined) {
  const { signatureData, getOrRefreshSiweSignature } = useGetOrRefreshSiweSignature(address);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    getOrRefreshSiweSignature();
  }, [address]);

  useEffect(() => {
    if (!address) {
      setIsModalOpen(false);
      return;
    }

    if (!signatureData) {
      setIsModalOpen(true);
    } else {
      setIsModalOpen(false);
    }
  }, [address, signatureData]);

  return {
    isModalOpen,
    handleSiweSignIn: getOrRefreshSiweSignature,
    closeModal: () => setIsModalOpen(false),
  };
}
