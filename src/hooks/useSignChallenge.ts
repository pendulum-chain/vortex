import { useEffect, useState, useCallback, useRef } from 'react';
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
  const [signatureData, setSignatureData] = useState<SiweSignatureData | undefined>(undefined);

  const requiresSignRef = useRef(requiresSign);
  const signatureDataRef = useRef(signatureData);

  useEffect(() => {
    requiresSignRef.current = requiresSign;
    signatureDataRef.current = signatureData;
  }, [requiresSign, signatureData]);

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
        setSignatureData(storedSignatureData);
        return storedSignatureData;
      } else {
        setSignatureData(undefined);
        localStorage.removeItem(storageKey);
        setRequiresSign(true);
        return undefined;
      }
    } else {
      setSignatureData(undefined);
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

      const validation_response = await fetch(`${SIGNING_SERVICE_URL}/v1/siwe/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nonce, signature }),
      });

      localStorage.setItem(storageKey, JSON.stringify(newSignatureData));
      setSignatureData(newSignatureData);
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

    setSignatureData(undefined);
    localStorage.removeItem(storageKey);
    setRequiresSign(true);
  }, [address, storageKey]);

  // Refresh on address change
  useEffect(() => {
    checkSiweSignatureValidity();
  }, [address, checkSiweSignatureValidity]);

  const checkAndWaitForSignature = useCallback((): Promise<SiweSignatureData> => {
    checkSiweSignatureValidity();

    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        // Access the latest values via refs
        if (!requiresSignRef.current && signatureDataRef.current) {
          clearInterval(interval);
          resolve(signatureDataRef.current);
        }

        if (!requiresSignRef.current && !signatureDataRef.current) {
          clearInterval(interval);
          reject('User cancelled login request');
        }
      }, 100);
    });
  }, [checkSiweSignatureValidity]);

  const forceAndWaitForSignature = useCallback((): Promise<SiweSignatureData> => {
    forceRefreshSiweSignature();

    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        // Access the latest values via refs
        if (!requiresSignRef.current && signatureDataRef.current) {
          clearInterval(interval);
          resolve(signatureDataRef.current);
        }

        if (!requiresSignRef.current && !signatureDataRef.current) {
          clearInterval(interval);
          reject('User cancelled the login request');
        }
      }, 100);
    });
  }, [forceRefreshSiweSignature]);

  return {
    requiresSign,
    checkAndWaitForSignature,
    signSiweMessage,
    forceRefreshSiweSignature: forceAndWaitForSignature,
    closeModal: () => setRequiresSign(false),
  };
}
