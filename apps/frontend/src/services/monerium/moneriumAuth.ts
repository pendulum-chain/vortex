import { siweMessage } from "@monerium/sdk";
import CryptoJS from "crypto-js";
import { polygon } from "viem/chains";
import { useMoneriumStore } from "../../stores/moneriumStore";

const VORTEX_APP_CLIENT_ID = process.env.REACT_APP_MONERIUM_CLIENT_ID || "eac7a71a-414d-11f0-bea7-ce527adad61b";
const MONERIUM_API_URL = process.env.REACT_APP_MONERIUM_API_URL || "https://api.monerium.app";
const LINK_MESSAGE = "I hereby declare that I am the address owner.";

export const initiateMoneriumAuth = async (address: string, signMessage: (message: string) => Promise<string>) => {
  const { setCodeVerifier, setFlowState } = useMoneriumStore.getState();
  console.log("Initiating Monerium auth for address:", address);
  // Generate PKCE code verifier and challenge
  const codeVerifier = CryptoJS.lib.WordArray.random(64).toString();
  const codeChallenge = CryptoJS.enc.Base64url.stringify(CryptoJS.SHA256(codeVerifier));

  // Sign link address message
  const signature = await signMessage(LINK_MESSAGE);

  // Store code verifier for later use
  setCodeVerifier(codeVerifier);
  setFlowState("redirecting");

  // Build auth URL for initial signup
  const params = new URLSearchParams({
    address: address,
    chain: polygon.name.toString().toLowerCase(),
    client_id: VORTEX_APP_CLIENT_ID,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    redirect_uri: window.location.origin,
    signature
  });

  return `${MONERIUM_API_URL}/auth?${params.toString()}`;
};

export const createMoneriumSiweMessage = (address: string) => {
  return siweMessage({
    address: address,
    appName: "Vortex",
    chainId: 137,
    domain: "localhost",
    privacyPolicyUrl: "https://example.com/privacy-policy",
    redirectUri: "http://localhost:5173",
    termsOfServiceUrl: "https://example.com/terms-of-service"
  });
};

export const handleMoneriumSiweAuth = async (address: string, signMessage: (message: string) => Promise<string>) => {
  const { setCodeVerifier, setFlowState } = useMoneriumStore.getState();
  console.log("Handling Monerium SIWE auth for address:", address);
  // Generate PKCE code verifier and challenge
  const codeVerifier = CryptoJS.lib.WordArray.random(64).toString();
  const codeChallenge = CryptoJS.enc.Base64url.stringify(CryptoJS.SHA256(codeVerifier));

  // Create SIWE message
  const message = createMoneriumSiweMessage(address);

  // Get signature from wallet
  const signature = await signMessage(message);

  // Store code verifier for later use
  setCodeVerifier(codeVerifier);
  setFlowState("siwe");

  // Make direct API call for SIWE auth
  const params = new URLSearchParams({
    authentication_method: "siwe",
    client_id: VORTEX_APP_CLIENT_ID,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    message: message,
    signature: signature
  });

  const authFlowUrl = `${MONERIUM_API_URL}/auth?${params}`;
  // Redirect to Monerium auth flow. This will redirect back with the code immediately after.
  window.location.assign(authFlowUrl);
};

export const exchangeMoneriumCode = async (code: string) => {
  const { codeVerifier, setAuthToken, setFlowState } = useMoneriumStore.getState();

  if (!codeVerifier) {
    throw new Error("No code verifier found");
  }

  setFlowState("authenticating");
  console.log("Exchanging Monerium code:", code, "with verifier:", codeVerifier);
  try {
    const response = await fetch("https://api.monerium.app/auth/token", {
      body: new URLSearchParams({
        client_id: VORTEX_APP_CLIENT_ID,
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code"
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
    setAuthToken(responseData.access_token);
    setFlowState("completed");
  } catch (error) {
    setFlowState("idle");
    throw error;
  }
};
