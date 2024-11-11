import { useEffect, useState, useCallback } from 'react';
import { useSignMessage } from 'wagmi';
import { SIGNING_SERVICE_URL } from '../constants/constants';
import { storageKeys } from '../constants/localStorage';
import { SiweMessage } from 'siwe';

export type SiweSignatureData = {
  nonce: string;
  signature: string;
  expirationDate: string;
};

export function useSiweSignature(address: `0x${string}` | undefined) {
  const { signMessageAsync } = useSignMessage();
  const [requiresSign, setRequiresSign] = useState<boolean>(false);

  const storageKey = `${storageKeys.SIWE_SIGNATURE_KEY_PREFIX}${address}`;

  const checkSiweSignatureValidity = useCallback((): SiweSignatureData | undefined => {
    if (!address) {
      setRequiresSign(false);
      return undefined;
    }

    const maybeStoredSignatureData = localStorage.getItem(storageKey);

    if (maybeStoredSignatureData) {
      const storedSignatureData: SiweSignatureData = JSON.parse(maybeStoredSignatureData);
      const expirationDate = new Date(storedSignatureData.expirationDate);

      if (expirationDate > new Date()) {
        setRequiresSign(false);
        return storedSignatureData;
      } else {
        localStorage.removeItem(storageKey);
        setRequiresSign(true);
        return undefined;
      }
    } else {
      setRequiresSign(true);
      return undefined;
    }
  }, [address, storageKey]);

  const signSiweMessage = useCallback(async () => {
    if (!address) {
      return;
    }

    try {
      const response = await fetch(`${SIGNING_SERVICE_URL}/v1/siwe/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress: address }),
      });

      const { siweMessage, nonce } = await response.json();

      const message = new SiweMessage(siweMessage);
      const expirationDate = message.expirationTime!;

      const signature = await signMessageAsync({ message: siweMessage });

      const newSignatureData: SiweSignatureData = {
        nonce,
        signature,
        expirationDate,
      };

      localStorage.setItem(storageKey, JSON.stringify(newSignatureData));
      setRequiresSign(false);
    } catch (error) {
      console.error('Error during SIWE sign-in:', error);
    }
  }, [address, signMessageAsync, storageKey]);

  // Function to force a signature refresh
  const forceRefreshSiweSignature = useCallback(() => {
    if (!address) {
      return;
    }

    localStorage.removeItem(storageKey);
    setRequiresSign(true);
  }, [address, storageKey]);

  // Refresh on address change
  useEffect(() => {
    checkSiweSignatureValidity();
  }, [address, checkSiweSignatureValidity]);

  return {
    requiresSign,
    checkSiweSignatureValidity,
    signSiweMessage,
    forceRefreshSiweSignature,
    closeModal: () => setRequiresSign(false),
  };
}
