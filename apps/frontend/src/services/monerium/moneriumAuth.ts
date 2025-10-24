import { siweMessage } from "@monerium/sdk";
import CryptoJS from "crypto-js";
import { config } from "../../config";
import { MoneriumKycActorRef } from "../../machines/types";

export enum MoneriumAuthErrorType {
  UserRejected = "USER_REJECTED",
  UnknownError = "UNKNOWN_ERROR"
}
export class MoneriumAuthError extends Error {
  type: MoneriumAuthErrorType;
  constructor(message: string, type: MoneriumAuthErrorType) {
    super(message);
    this.type = type;
  }
}

export const MONERIUM_MINT_NETWORK = config.isSandbox ? "amoy" : "polygon";
const MONERIUM_MINT_NETWORK_CHAIN_ID = config.isSandbox ? 80002 : 137;
const VORTEX_APP_CLIENT_ID = import.meta.env.VITE_MONERIUM_CLIENT_ID || "8a7a2092-4610-11f0-ab69-cab7165906f7";
// Use custom API URL if provided, otherwise use default sandbox/dev endpoints
const MONERIUM_API_URL =
  import.meta.env.VITE_MONERIUM_API_URL || (config.isSandbox ? "https://api.monerium.dev" : "https://api.monerium.app");
const LINK_MESSAGE = "I hereby declare that I am the address owner.";
const MONERIUM_APP_NAME = "Vortex";

export const initiateMoneriumAuth = async (
  address: string,
  signMessage: (message: string) => Promise<string>,
  parent: MoneriumKycActorRef
): Promise<{ authUrl: string; codeVerifier: string }> => {
  console.log("Initiating Monerium auth for address:", address);
  // Generate PKCE code verifier and challenge
  const codeVerifier = CryptoJS.lib.WordArray.random(64).toString();
  const codeChallenge = CryptoJS.enc.Base64url.stringify(CryptoJS.SHA256(codeVerifier));

  try {
    parent.send({ phase: "login", type: "SIGNING_UPDATE" });
    const signature = await signMessage(LINK_MESSAGE);
    parent.send({ phase: "finished", type: "SIGNING_UPDATE" });

    const redirectUri = window.location.origin + "/widget";

    const params = new URLSearchParams({
      address: address,
      chain: MONERIUM_MINT_NETWORK,
      client_id: VORTEX_APP_CLIENT_ID,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      redirect_uri: redirectUri,
      signature
    });

    const authUrl = `${MONERIUM_API_URL}/auth?${params.toString()}`;
    return { authUrl, codeVerifier };
  } catch (error) {
    if (error instanceof Error && error.message.includes("User rejected the request")) {
      throw new MoneriumAuthError("User rejected the request.", MoneriumAuthErrorType.UserRejected);
    }
    console.log("Error during Monerium auth:", error);
    throw error;
  }
};

export const createMoneriumSiweMessage = (address: string) => {
  const redirectUri = window.location.origin + "/widget";
  const domain = window.location.hostname;

  return siweMessage({
    address: address,
    appName: MONERIUM_APP_NAME,
    chainId: MONERIUM_MINT_NETWORK_CHAIN_ID,
    domain: domain,
    privacyPolicyUrl: "https://example.com/privacy-policy",
    redirectUri,
    termsOfServiceUrl: "https://example.com/terms-of-service"
  });
};

export const handleMoneriumSiweAuth = async (
  address: string,
  signMessage: (message: string) => Promise<string>,
  parent: MoneriumKycActorRef
): Promise<{ authUrl: string; codeVerifier: string }> => {
  console.log("Handling Monerium SIWE auth for address:", address);

  const codeVerifier = CryptoJS.lib.WordArray.random(64).toString();
  const codeChallenge = CryptoJS.enc.Base64url.stringify(CryptoJS.SHA256(codeVerifier));
  const redirectUri = window.location.origin + "/widget";

  const message = createMoneriumSiweMessage(address);

  try {
    parent.send({ phase: "login", type: "SIGNING_UPDATE" });
    const signature = await signMessage(message);
    parent.send({ phase: "finished", type: "SIGNING_UPDATE" });
    const params = new URLSearchParams({
      authentication_method: "siwe",
      client_id: VORTEX_APP_CLIENT_ID,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      message: message,
      redirect_uri: redirectUri,
      signature: signature
    });

    const authUrl = `${MONERIUM_API_URL}/auth?${params}`;
    return { authUrl, codeVerifier };
  } catch (error) {
    if (error instanceof Error && error.message.includes("User rejected the request")) {
      throw new MoneriumAuthError("User rejected the request.", MoneriumAuthErrorType.UserRejected);
    }
    console.log("Error during Monerium SIWE auth:", error);
    throw error;
  }
};

export const exchangeMoneriumCode = async (code: string, codeVerifier: string): Promise<{ authToken: string }> => {
  console.log("Exchanging Monerium code:", code, "with verifier:", codeVerifier);
  const redirectUri = window.location.origin + "/widget";
  const response = await fetch(`${MONERIUM_API_URL}/auth/token`, {
    body: new URLSearchParams({
      client_id: VORTEX_APP_CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri // We MUST use the same redirect URI as in the initial request
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error("Failed to exchange code");
  }

  const responseData = await response.json();
  console.log("Monerium auth response:", responseData);
  return { authToken: responseData.access_token };
};
