import { useEffect, useState, useCallback, useRef } from 'react';
import { useSignMessage } from 'wagmi';
import { SIGNING_SERVICE_URL } from '../constants/constants';
import { storageKeys } from '../constants/localStorage';
import { SiweMessage } from 'siwe';

export interface SiweSignatureData {
  nonce: string;
  signature: string;
  expirationDate: string;
}

export function useSiweSignature(address?: `0x${string}`) {
  const { signMessageAsync } = useSignMessage();
  const [requiresSign, setRequiresSign] = useState(false);

  // Used to wait for the modal interaction and/or return of the
  // signing promise.
  const signPromiseRef = useRef<{
    resolve: (data: SiweSignatureData) => void;
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

  const signMessage = useCallback((): Promise<SiweSignatureData> => {
    return new Promise((resolve, reject) => {
      signPromiseRef.current = { resolve, reject };
      setRequiresSign(true);
    });
  }, [setRequiresSign]);

  const handleSign = useCallback(async () => {
    if (!address || !signPromiseRef.current) return;

    try {
      const response = await fetch(`${SIGNING_SERVICE_URL}/v1/siwe/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });

      if (!response.ok) throw new Error('Failed to create message');
      const { siweMessage, nonce } = await response.json();

      const message = new SiweMessage(siweMessage);
      const signature = await signMessageAsync({ message: siweMessage });

      const validationResponse = await fetch(`${SIGNING_SERVICE_URL}/v1/siwe/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nonce, signature }),
      });

      if (!validationResponse.ok) throw new Error('Failed to validate signature');

      const signatureData: SiweSignatureData = {
        nonce,
        signature,
        expirationDate: message.expirationTime!,
      };

      localStorage.setItem(storageKey, JSON.stringify(signatureData));
      signPromiseRef.current.resolve(signatureData);
    } catch (error) {
      signPromiseRef.current.reject(new Error('Signing failed'));
    } finally {
      setRequiresSign(false);
      signPromiseRef.current = null;
    }
  }, [address, signMessageAsync, storageKey]);

  // Handler for modal cancellation
  const handleCancel = useCallback(() => {
    if (signPromiseRef.current) {
      signPromiseRef.current.reject(new Error('User cancelled'));
      signPromiseRef.current = null;
    }
    setRequiresSign(false);
  }, []);

  const checkAndWaitForSignature = useCallback(async (): Promise<SiweSignatureData> => {
    const stored = checkStoredSignature();
    if (stored) return stored;
    return signMessage();
  }, [checkStoredSignature, signMessage]);

  const forceRefreshAndWaitForSignature = useCallback(async (): Promise<SiweSignatureData> => {
    localStorage.removeItem(storageKey);
    return signMessage();
  }, [storageKey, signMessage]);

  // ask for signature on address change and on init
  // useEffect(() => {
  //   if (address) {
  //     const stored = checkStoredSignature();
  //     if (!stored) signMessage();
  //   }
  // }, [address, checkStoredSignature, signMessage]);

  return {
    requiresSign,
    handleSign,
    handleCancel,
    checkAndWaitForSignature,
    forceRefreshAndWaitForSignature,
  };
}
