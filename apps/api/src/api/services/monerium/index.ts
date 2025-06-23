import { MoneriumResponse } from './types';

export const getFirstMoneriumLinkedAddress = async (token: string): Promise<string | null> => {
  const url = 'https://api.monerium.app/addresses';
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.monerium.api-v2+json',
  };

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: MoneriumResponse = await response.json();

    if (data.addresses && data.addresses.length > 0) {
      const firstAddress = data.addresses[data.addresses.length - 1].address; // Ordered by creation date, so last is the most recent.
      return firstAddress;
    } else {
      console.log('No addresses found in the response.');
      return null;
    }
  } catch (error) {
    console.error('Failed to fetch addresses:', error);
    return null;
  }
};

export const getMoneriumEvmDefaultMintAddress = async (token: string): Promise<string | null> => {
  // Assumption is the first linked address is the default mint address for Monerium EVM transactions.
  // TODO: this needs to be confirmed.
  return getFirstMoneriumLinkedAddress(token);
};
