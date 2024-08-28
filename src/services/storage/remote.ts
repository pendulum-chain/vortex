import { SIGNING_SERVICE_URL } from '../../constants/constants';

// These are the headers for the Google Spreadsheet
type Data = {
  timestamp: string;
  polygonAddress: string;
  stellarEphemeralPublicKey: string;
  pendulumEphemeralPublicKey: string;
  nablaApprovalTx: string;
  nablaSwapTx: string;
  spacewalkRedeemTx: string;
  stellarOfframpTx: string;
  stellarCleanupTx: string;
};

export async function storeDataInBackend(data: Data) {
  const response = await fetch(`${SIGNING_SERVICE_URL}/v1/storage/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Error while sending data to storage endpoint`);
  }
}
