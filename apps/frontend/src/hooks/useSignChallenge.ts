import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LOGIN_EXPIRATION_TIME_HOURS, SIGNING_SERVICE_URL } from "../constants/constants";
import { storageKeys } from "../constants/localStorage";
import { SignInMessage } from "../helpers/siweMessageFormatter";
import { useVortexAccount } from "./useVortexAccount";

export interface SiweSignatureData {
  signatureSet: boolean;
  expirationDate: string;
}

function createSiweMessage(address: string, nonce: string) {
  const siweMessage = new SignInMessage({
    address: address,
    domain: window.location.host,
    expirationTime: new Date(Date.now() + DEFAULT_LOGIN_EXPIRATION_TIME_HOURS * 60 * 60 * 1000).getTime(), // Constructor in ms.
    nonce,
    scheme: "https"
  });

  return siweMessage.toMessage();
}

export function useSiweSignature() {
  const { address, getMessageSignature } = useVortexAccount();
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
      setSignPromise({ reject, resolve });
    });
  }, [signPromise]);

  const handleSign = useCallback(async () => {
    if (!address || !signPromise) return;

    try {
      const messageResponse = await fetch(`${SIGNING_SERVICE_URL}/v1/siwe/create`, {
        body: JSON.stringify({ walletAddress: address }),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });

      if (!messageResponse.ok) throw new Error("Failed to create message");
      const { nonce } = await messageResponse.json();

      // Message in both string and object form
      const siweMessage = createSiweMessage(address, nonce);
      const message = SignInMessage.fromMessage(siweMessage);

      const signature = await getMessageSignature(siweMessage);

      const validationResponse = await fetch(`${SIGNING_SERVICE_URL}/v1/siwe/validate`, {
        body: JSON.stringify({ nonce, signature, siweMessage }),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });

      if (!validationResponse.ok) throw new Error("Failed to validate signature");

      const signatureData: SiweSignatureData = {
        expirationDate: message.expirationTime, // Field is validated in the message. Should not be null when submitting.
        signatureSet: true
      };

      localStorage.setItem(storageKey, JSON.stringify(signatureData));
      signPromise.resolve();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // First case Assethub, second case EVM
      if ((error as Error).message.includes("User rejected the request") || (error as Error).message.includes("Cancelled")) {
        return signPromise.reject(new Error("Signing failed: User rejected sign request"));
      }
      return signPromise.reject(new Error("Signing failed: Failed to sign login challenge. " + errorMessage));
    } finally {
      setSignPromise(null);
    }
  }, [address, storageKey, signPromise, getMessageSignature]);

  useEffect(() => {
    if (signPromise) handleSign();
  }, [signPromise, handleSign]);

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
    checkAndWaitForSignature,
    forceRefreshAndWaitForSignature
  };
}
