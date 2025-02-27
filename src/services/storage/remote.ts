import { SIGNING_SERVICE_URL } from '../../constants/constants';

// These are the headers for the Google Spreadsheet
interface DumpData {
  timestamp: string;
  offramperAddress: string;
  stellarEphemeralPublicKey?: string;
  pendulumEphemeralPublicKey: string;
  nablaApprovalTx: string;
  nablaSwapTx: string;
  spacewalkRedeemTx?: string;
  stellarOfframpTx?: string;
  stellarCleanupTx?: string;
  pendulumToMoonbeamXcmTx?: string;
  inputAmount: string;
  inputTokenType: string;
  outputAmount: string;
  outputTokenType: string;
  squidRouterReceiverId: string;
  squidRouterReceiverHash: string;
}

interface EmailData {
  email: string;
  transactionId: string;
}

interface RatingData {
  rating: number;
  walletAddress: string;
}

async function sendRequestToBackend(endpoint: string, data: EmailData | DumpData | RatingData) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Error while sending data to ${endpoint}`);
  }

  return await response.json();
}

export async function storeDataInBackend(data: DumpData) {
  const endpoint = `${SIGNING_SERVICE_URL}/v1/storage/create`;
  return await sendRequestToBackend(endpoint, data);
}

export async function storeUserEmailInBackend(data: EmailData) {
  const endpoint = `${SIGNING_SERVICE_URL}/v1/email/create`;
  const payload = { ...data, timestamp: new Date().toISOString() };
  return await sendRequestToBackend(endpoint, payload);
}

export async function storeUserRatingInBackend(data: RatingData) {
  const endpoint = `${SIGNING_SERVICE_URL}/v1/rating/create`;
  const payload = { ...data, timestamp: new Date().toISOString() };
  return await sendRequestToBackend(endpoint, payload);
}
