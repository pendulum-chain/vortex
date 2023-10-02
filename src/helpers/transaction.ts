import { toast } from 'react-toastify';

export const transactionErrorToast = (err: unknown) => {
  const cancelled = String(err).startsWith('Error: Cancelled');
  toast(cancelled ? 'Transaction cancelled' : 'Transaction failed', { type: 'error' });
};
