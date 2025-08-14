import { useCallback, useEffect, useState } from "react";
import { ActorRefFrom, SnapshotFrom } from "xstate";
import { DEFAULT_LOGIN_EXPIRATION_TIME_HOURS, SIGNING_SERVICE_URL } from "../constants/constants";
import { storageKeys } from "../constants/localStorage";
import { SignInMessage } from "../helpers/siweMessageFormatter";
import { stellarKycMachine } from "../machines/stellarKyc.machine";
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

export function useSiweSignature(stellarKycActor: ActorRefFrom<typeof stellarKycMachine> | undefined) {
  const { address, getMessageSignature } = useVortexAccount();
  const [isSigning, setIsSigning] = useState(false);

  const storageKey = `${storageKeys.SIWE_SIGNATURE_KEY_PREFIX}${address}`;

  const checkAuthStatus = useCallback(async () => {
    if (!stellarKycActor) return;
    if (!address) {
      console.log("Address must be defined. This is a bug.");
      stellarKycActor.send({ type: "AUTH_INVALID" });
      return;
    }

    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      stellarKycActor.send({ type: "AUTH_INVALID" });
      return;
    }

    const data: SiweSignatureData = JSON.parse(stored);
    if (new Date(data.expirationDate) <= new Date()) {
      localStorage.removeItem(storageKey);
      stellarKycActor.send({ type: "AUTH_INVALID" });
      return;
    }

    try {
      const authCheckResponse = await fetch(`${SIGNING_SERVICE_URL}/v1/siwe/check`, {
        credentials: "include"
      });

      if (authCheckResponse.ok) {
        stellarKycActor.send({ type: "AUTH_VALID" });
      } else {
        localStorage.removeItem(storageKey);
        stellarKycActor.send({ type: "AUTH_INVALID" });
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      stellarKycActor.send({ error: "Failed to check auth status.", type: "SIGNATURE_FAILURE" });
    }
  }, [address, storageKey, stellarKycActor]);

  const promptForSignature = useCallback(async () => {
    if (!address || isSigning || !stellarKycActor) return;
    setIsSigning(true);

    try {
      const messageResponse = await fetch(`${SIGNING_SERVICE_URL}/v1/siwe/create`, {
        body: JSON.stringify({ walletAddress: address }),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });

      if (!messageResponse.ok) throw new Error("Failed to create message");
      const { nonce } = await messageResponse.json();

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
        expirationDate: message.expirationTime!,
        signatureSet: true
      };

      localStorage.setItem(storageKey, JSON.stringify(signatureData));
      stellarKycActor.send({ type: "SIGNATURE_SUCCESS" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("User rejected") || errorMessage.includes("Cancelled")) {
        stellarKycActor.send({ error: "User rejected signing request.", type: "SIGNATURE_FAILURE" });
      } else {
        stellarKycActor.send({ error: "Failed to sign login challenge. " + errorMessage, type: "SIGNATURE_FAILURE" });
      }
    } finally {
      setIsSigning(false);
    }
  }, [address, isSigning, getMessageSignature, storageKey, stellarKycActor]);

  useEffect(() => {
    if (!stellarKycActor) return;
    // We react to the different state changes of the stellarKycActor.
    stellarKycActor.on("CHECK_AUTH_STATUS", event => {
      checkAuthStatus();
    });

    stellarKycActor.on("PROMPT_FOR_SIGNATURE", event => {
      promptForSignature();
    });

    stellarKycActor.send({ type: "SIWE_READY" });
  }, [stellarKycActor, checkAuthStatus, promptForSignature]);

  return {};
}
