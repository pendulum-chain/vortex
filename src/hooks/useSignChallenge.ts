import { useState, useCallback } from 'react';
import { useSignMessage } from 'wagmi';
import { SIGNING_SERVICE_URL } from '../constants/constants';
import { storageKeys } from '../constants/localStorage';
import { SiweMessage } from 'siwe';
import { DEFAULT_LOGIN_EXPIRATION_TIME_HOURS } from '../constants/constants';
import { polygon } from 'wagmi/chains';

export interface SiweSignatureData {
  signatureSet: boolean;
  expirationDate: string;
}

function createSiweMessage(address: `0x${string}`, nonce: string) {
  // Make constants on config
  const siweMessage = new SiweMessage({
    scheme: 'https',
    domain: window.location.host,
    address,
    statement: 'Please sign the message to login!',
    uri: window.location.origin,
    version: '1',
    chainId: polygon.id,
    nonce,
    expirationTime: new Date(Date.now() + DEFAULT_LOGIN_EXPIRATION_TIME_HOURS * 60 * 60 * 1000).toISOString(), // Constructor in ms.
  });
  return siweMessage.toMessage();
}

export function useSiweSignature(address?: `0x${string}`) {
  const { signMessageAsync } = useSignMessage();
  const [signingPending, setSigningPending] = useState(false);

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

  const signMessage = useCallback((): Promise<void> | undefined => {
    if (signPromise) return;
    return new Promise((resolve, reject) => {
      setSignPromise({ resolve, reject });
      setSigningPending(true);
    });
  }, [setSigningPending, setSignPromise, signPromise]);

  const handleSign = useCallback(async () => {
    if (!address || !signPromise) return;

    try {
      const messageResponse = await fetch(`${SIGNING_SERVICE_URL}/v1/siwe/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ walletAddress: address }),
      });

      if (!messageResponse.ok) throw new Error('Failed to create message');
      const { nonce } = await messageResponse.json();

      const siweMessage = createSiweMessage(address, nonce);

      const message = new SiweMessage(siweMessage);
      const signature = await signMessageAsync({ message: siweMessage });

      const validationResponse = await fetch(`${SIGNING_SERVICE_URL}/v1/siwe/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nonce, signature, siweMessage }),
      });

      if (!validationResponse.ok) throw new Error('Failed to validate signature');

      const signatureData: SiweSignatureData = {
        signatureSet: true,
        expirationDate: message.expirationTime!,
      };

      localStorage.setItem(storageKey, JSON.stringify(signatureData));
      signPromise.resolve();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      signPromise.reject(new Error('Signing failed: ' + errorMessage));
    } finally {
      setSigningPending(false);
      setSignPromise(null);
    }
  }, [address, storageKey, signMessageAsync, signPromise, setSigningPending, setSignPromise]);

  // Handler for modal cancellation
  const handleCancel = useCallback(() => {
    if (signPromise) {
      signPromise.reject(new Error('User cancelled'));
      setSignPromise(null);
    }
    setSigningPending(false);
  }, [signPromise, setSigningPending, setSignPromise]);

  const checkAndWaitForSignature = useCallback(async (): Promise<void> => {
    const stored = checkStoredSignature();
    if (stored) return;
    return signMessage();
  }, [checkStoredSignature, signMessage]);

  const forceRefreshAndWaitForSignature = useCallback(async (): Promise<void> => {
    localStorage.removeItem(storageKey);
    return signMessage();
  }, [storageKey, signMessage]);

  return {
    signingPending,
    handleSign,
    handleCancel,
    checkAndWaitForSignature,
    forceRefreshAndWaitForSignature,
  };
}
