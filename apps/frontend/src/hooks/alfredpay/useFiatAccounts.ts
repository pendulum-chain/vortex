import { type UseQueryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type AlfredpayAddFiatAccountRequest,
  type AlfredpayListFiatAccountsResponse,
  isAlfredpayToken
} from "@vortexfi/shared";
import { cacheKeys, inactiveOptions } from "../../constants/cache";
import { ALFREDPAY_FIAT_TOKEN_TO_COUNTRY } from "../../constants/fiatAccountMethods";
import { AlfredpayService } from "../../services/api/alfredpay.service";
import { useFiatToken } from "../../stores/quote/useQuoteFormStore";

type FiatAccountsQueryPartialOptions = Omit<
  UseQueryOptions<AlfredpayListFiatAccountsResponse, Error, AlfredpayListFiatAccountsResponse, readonly unknown[]>,
  "queryKey" | "queryFn"
>;

export function useFiatAccounts(country: string, options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && !!country;
  return useQuery<AlfredpayListFiatAccountsResponse>({
    enabled,
    queryFn: ({ signal }) => AlfredpayService.listFiatAccounts(country, signal),
    queryKey: [cacheKeys.fiatAccounts, country],
    ...(inactiveOptions["5m"] as FiatAccountsQueryPartialOptions)
  });
}

export function useAlfredpayFiatAccounts() {
  const fiatToken = useFiatToken();
  const country = isAlfredpayToken(fiatToken) ? (ALFREDPAY_FIAT_TOKEN_TO_COUNTRY[fiatToken] ?? null) : null;
  return { country, ...useFiatAccounts(country ?? "", { enabled: !!country }) };
}

export function useAddFiatAccount(country: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AlfredpayAddFiatAccountRequest) => AlfredpayService.addFiatAccount(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [cacheKeys.fiatAccounts, country] })
  });
}

export function useDeleteFiatAccount(country: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fiatAccountId: string) => AlfredpayService.deleteFiatAccount(fiatAccountId, country),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [cacheKeys.fiatAccounts, country] })
  });
}
