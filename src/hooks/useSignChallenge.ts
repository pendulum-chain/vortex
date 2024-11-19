import { useState, useCallback } from 'react';
import { useSignMessage } from 'wagmi';
import { SIGNING_SERVICE_URL } from '../constants/constants';
import { storageKeys } from '../constants/localStorage';
import { SiweMessage } from 'siwe';

export interface SiweSignatureData {
  signatureSet: boolean;
  expirationDate: string;
}

export function useSiweSignature(address?: `0x${string}`) {
  const { signMessageAsync } = useSignMessage();
  const [requiresSign, setRequiresSign] = useState(false);

  // Used to wait for the modal interaction and/or return of the
  // signing promise.
  const [signPromise, setSignPromise] = useState<{
    resolve: () => void;
    reject: (reason: Error) => void;
  } | null>(null);

  const storageKey = `${storageKeys.SIWE_SIGNATURE_KEY_PREFIX}${address}`;

  const checkStoredSignature = useCallback((): SiweSignatureData | null => {
    if (!address) return null;

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return null;

      const data: SiweSignatureData = JSON.parse(stored);
      return new Date(data.expirationDate) > new Date() ? data : null;
    } catch {
      localStorage.removeItem(storageKey);
      return null;
    }
  }, [address, storageKey]);

  const signMessage = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      setSignPromise({ resolve, reject });
      setRequiresSign(true);
    });
  }, [setRequiresSign, setSignPromise]);

  const handleSign = useCallback(async () => {
    if (!address || !signPromise) return;

    try {
      const response = await fetch(`${SIGNING_SERVICE_URL}/v1/siwe/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ walletAddress: address }),
      });

      if (!response.ok) throw new Error('Failed to create message');
      const { siweMessage, nonce } = await response.json();

      const message = new SiweMessage(siweMessage);
      const signature = await signMessageAsync({ message: siweMessage });

      const validationResponse = await fetch(`${SIGNING_SERVICE_URL}/v1/siwe/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nonce, signature }),
      });

      if (!validationResponse.ok) throw new Error('Failed to validate signature');

      const signatureData: SiweSignatureData = {
        signatureSet: true,
        expirationDate: message.expirationTime!,
      };

      localStorage.setItem(storageKey, JSON.stringify(signatureData));
      signPromise.resolve();
    } catch (error) {
      signPromise.reject(new Error('Signing failed'));
    } finally {
      setRequiresSign(false);
      setSignPromise(null);
    }
  }, [address, storageKey, signMessageAsync, signPromise, setRequiresSign, setSignPromise]);

  // Handler for modal cancellation
  const handleCancel = useCallback(() => {
    if (signPromise) {
      signPromise.reject(new Error('User cancelled'));
      setSignPromise(null);
    }
    setRequiresSign(false);
  }, [signPromise, setRequiresSign, setSignPromise]);

  const checkAndWaitForSignature = useCallback(async (): Promise<void> => {
    const stored = checkStoredSignature();
    console.log('stored', stored);
    if (stored) return;
    return signMessage();
  }, [checkStoredSignature, signMessage]);

  const forceRefreshAndWaitForSignature = useCallback(async (): Promise<void> => {
    localStorage.removeItem(storageKey);
    return signMessage();
  }, [storageKey, signMessage]);

  return {
    requiresSign,
    handleSign,
    handleCancel,
    checkAndWaitForSignature,
    forceRefreshAndWaitForSignature,
  };
}
