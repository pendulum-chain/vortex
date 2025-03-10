import { useQuery } from '@tanstack/react-query';
import { BrlaKycStatus } from '../useBRLAKYCProcess';
import { fetchKycStatus } from '../../../services/signingService';

const POLLING_INTERVAL_MS = 2000;
const RETRY_DELAY_MS = 5000; // 5 seconds
const MAX_RETRIES = 5;

export const useKYCStatusQuery = (cpf: string | null) => {
  return useQuery<BrlaKycStatus, Error>({
    queryKey: ['kyc-status', cpf],
    queryFn: async () => {
      if (!cpf) throw new Error('CPF is required');
      return fetchKycStatus(cpf);
    },
    enabled: !!cpf,
    refetchInterval: (query) => {
      if (!query.state.data || query.state.data.status === 'PENDING') return POLLING_INTERVAL_MS;
      return false;
    },
    retry: MAX_RETRIES,
    retryDelay: () => RETRY_DELAY_MS,
    staleTime: 0,
  });
};
