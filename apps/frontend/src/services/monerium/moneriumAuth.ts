import { siweMessage } from '@monerium/sdk';
import CryptoJS from 'crypto-js';
import { useMoneriumStore } from '../../stores/moneriumStore';

const VORTEX_APP_CLIENT_ID = process.env.REACT_APP_MONERIUM_CLIENT_ID || 'vortex-app-client-id';
const MONERIUM_API_URL = process.env.REACT_APP_MONERIUM_API_URL || 'https://api.monerium.app';
const LINK_MESSAGE = 'I hereby declare that I am the address owner.';

export const initiateMoneriumAuth = async (address: string, signMessage: (message: string) => Promise<string>) => {
  const { setCodeVerifier, setFlowState } = useMoneriumStore.getState();
  console.log('Initiating Monerium auth for address:', address);
  // Generate PKCE code verifier and challenge
  const codeVerifier = CryptoJS.lib.WordArray.random(64).toString();
  const codeChallenge = CryptoJS.enc.Base64url.stringify(CryptoJS.SHA256(codeVerifier));

  // Sign link address message
  const signature = await signMessage(LINK_MESSAGE);

  // Store code verifier for later use
  setCodeVerifier(codeVerifier);
  setFlowState('redirecting');

  // Build auth URL for initial signup
  const params = new URLSearchParams({
    client_id: VORTEX_APP_CLIENT_ID,
    redirect_uri: window.location.origin,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    address: address,
    signature,
    chain: 'Polygon',
  });

  return `${MONERIUM_API_URL}/auth?${params.toString()}`;
};

export const createMoneriumSiweMessage = (address: string) => {
  return siweMessage({
    domain: 'localhost',
    address: address,
    appName: 'Vortex',
    redirectUri: 'http://localhost',
    chainId: 137,
    privacyPolicyUrl: 'https://example.com/privacy-policy',
    termsOfServiceUrl: 'https://example.com/terms-of-service',
  });
};

export const handleMoneriumSiweAuth = async (address: string, signMessage: (message: string) => Promise<string>) => {
  const { setCodeVerifier, setFlowState } = useMoneriumStore.getState();

  // Generate PKCE code verifier and challenge
  const codeVerifier = CryptoJS.lib.WordArray.random(64).toString();
  const codeChallenge = CryptoJS.enc.Base64url.stringify(CryptoJS.SHA256(codeVerifier));

  // Create SIWE message
  const message = createMoneriumSiweMessage(address);

  // Get signature from wallet
  const signature = await signMessage(message);

  // Store code verifier for later use
  setCodeVerifier(codeVerifier);
  setFlowState('siwe');

  // Make direct API call for SIWE auth
  const params = new URLSearchParams({
    client_id: VORTEX_APP_CLIENT_ID,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    authentication_method: 'siwe',
    signature: signature,
    message: message,
  });

  const response = await fetch(`${MONERIUM_API_URL}/auth?${params.toString()}`, {
    redirect: 'manual',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    },
  });

  if (response.status === 302 || response.status === 301) {
    const location = response.headers.get('Location');
    if (location) {
      const urlParams = new URLSearchParams(location.split('?')[1]);
      const code = urlParams.get('code');
      if (code) {
        return code;
      }
    }
  }

  throw new Error('Failed to authenticate with SIWE');
};

export const exchangeMoneriumCode = async (code: string) => {
  const { codeVerifier, setAuthToken, setFlowState } = useMoneriumStore.getState();

  if (!codeVerifier) {
    throw new Error('No code verifier found');
  }

  setFlowState('authenticating');

  try {
    const response = await fetch('https://api.monerium.app/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: VORTEX_APP_CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange code');
    }

    const responseData = await response.json();
    console.log('Monerium auth response:', responseData);
    setAuthToken(responseData.authToken);
    setFlowState('completed');
  } catch (error) {
    setFlowState('idle');
    throw error;
  }
};
