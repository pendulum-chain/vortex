import { useQuery } from '@tanstack/react-query';
import { BrlaKycStatus } from '../useBRLAKYCProcess';
import { fetchKycStatus } from '../../../services/signingService';

const POLLING_INTERVAL_MS = 2000;

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
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 0,
  });
};
