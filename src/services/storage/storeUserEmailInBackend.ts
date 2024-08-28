import { SIGNING_SERVICE_URL } from '../../constants/constants';

// These are the headers for the Google Spreadsheet
type Data = {
  email: string;
};

export async function storeUserEmailInBackend(data: Data) {
  const response = await fetch(`${SIGNING_SERVICE_URL}/v1/email/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...data, timestamp: new Date().toISOString() }),
  });

  if (!response.ok) {
    throw new Error(`Error while sending data to email endpoint`);
  }

  return await response.json();
}
