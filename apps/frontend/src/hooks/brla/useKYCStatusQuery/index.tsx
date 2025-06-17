import { BrlaGetKycStatusResponse } from "@packages/shared";
import { useQuery } from "@tanstack/react-query";
import { KycStatus, fetchKycStatus } from "../../../services/signingService";
import { KycLevel } from "../useBRLAKYCProcess";

const POLLING_INTERVAL_MS = 2000;
const RETRY_DELAY_MS = 5000; // 5 seconds
const MAX_RETRIES = 5;

export const useKycStatusQuery = (cpf: string | null, level: KycLevel = KycLevel.LEVEL_1) => {
  return useQuery<BrlaGetKycStatusResponse, Error>({
    queryKey: ["kyc-status", cpf],
    queryFn: async () => {
      if (!cpf) throw new Error("CPF is required");
      return fetchKycStatus(cpf);
    },
    enabled: !!cpf,
    refetchInterval: query => {
      const data = query.state.data;
      if (!data) return POLLING_INTERVAL_MS;
      if (data.level !== level) return POLLING_INTERVAL_MS;
      if (data.status === KycStatus.PENDING || data.status === KycStatus.REJECTED) return POLLING_INTERVAL_MS;

      return false;
    },
    retry: MAX_RETRIES,
    retryDelay: () => RETRY_DELAY_MS,
    staleTime: 0
  });
};
