import { siweMessage } from "@monerium/sdk";
import CryptoJS from "crypto-js";
import { polygon } from "viem/chains";

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

const VORTEX_APP_CLIENT_ID = process.env.REACT_APP_MONERIUM_CLIENT_ID || "eac7a71a-414d-11f0-bea7-ce527adad61b";
const MONERIUM_API_URL = process.env.REACT_APP_MONERIUM_API_URL || "https://api.monerium.app";
const LINK_MESSAGE = "I hereby declare that I am the address owner.";

export const initiateMoneriumAuth = async (
  address: string,
  signMessage: (message: string) => Promise<string>
): Promise<{ authUrl: string; codeVerifier: string }> => {
  console.log("Initiating Monerium auth for address:", address);
  // Generate PKCE code verifier and challenge
  const codeVerifier = CryptoJS.lib.WordArray.random(64).toString();
  const codeChallenge = CryptoJS.enc.Base64url.stringify(CryptoJS.SHA256(codeVerifier));

  const signature = await signMessage(LINK_MESSAGE);

  const params = new URLSearchParams({
    address: address,
    chain: polygon.name.toString().toLowerCase(),
    client_id: VORTEX_APP_CLIENT_ID,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    redirect_uri: window.location.origin,
    signature
  });

  const authUrl = `${MONERIUM_API_URL}/auth?${params.toString()}`;
  return { authUrl, codeVerifier };
};

export const createMoneriumSiweMessage = (address: string) => {
  const currentUrl = window.location.origin;
  const domain = window.location.hostname;

  return siweMessage({
    address: address,
    appName: "Vortex",
    chainId: 137,
    domain: domain,
    privacyPolicyUrl: "https://example.com/privacy-policy",
    redirectUri: currentUrl,
    termsOfServiceUrl: "https://example.com/terms-of-service"
  });
};

export const handleMoneriumSiweAuth = async (
  address: string,
  signMessage: (message: string) => Promise<string>
): Promise<{ authUrl: string; codeVerifier: string }> => {
  console.log("Handling Monerium SIWE auth for address:", address);

  const codeVerifier = CryptoJS.lib.WordArray.random(64).toString();
  const codeChallenge = CryptoJS.enc.Base64url.stringify(CryptoJS.SHA256(codeVerifier));

  const message = createMoneriumSiweMessage(address);

  try {
    const signature = await signMessage(message);

    const params = new URLSearchParams({
      authentication_method: "siwe",
      client_id: VORTEX_APP_CLIENT_ID,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      message: message,
      redirect_uri: window.location.origin,
      signature: signature
    });

    const authUrl = `${MONERIUM_API_URL}/auth?${params}`;
    console.log("Monerium auth URL:", authUrl);
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
  const response = await fetch("https://api.monerium.app/auth/token", {
    body: new URLSearchParams({
      client_id: VORTEX_APP_CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: window.location.origin // We MUST use the same redirect URI as in the initial request
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
