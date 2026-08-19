import { type UseQueryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type DomesticAddFiatAccountRequest, type DomesticListFiatAccountsResponse, isDomesticToken } from "@vortexfi/shared";
import { cacheKeys, inactiveOptions } from "../../constants/cache";
import { ALFREDPAY_FIAT_TOKEN_TO_COUNTRY } from "../../constants/fiatAccountMethods";
import { AlfredpayService } from "../../services/api/alfredpay.service";
import { useFiatToken } from "../../stores/quote/useQuoteFormStore";

type FiatAccountsQueryPartialOptions = Omit<
  UseQueryOptions<DomesticListFiatAccountsResponse, Error, DomesticListFiatAccountsResponse, readonly unknown[]>,
  "queryKey" | "queryFn"
>;

export function useFiatAccounts(country: string, options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && !!country;
  return useQuery<DomesticListFiatAccountsResponse>({
    enabled,
    queryFn: ({ signal }) => AlfredpayService.listFiatAccounts(country, signal),
    queryKey: [cacheKeys.fiatAccounts, country],
    ...(inactiveOptions["5m"] as FiatAccountsQueryPartialOptions)
  });
}

export function useAlfredpayFiatAccounts() {
  const fiatToken = useFiatToken();
  const country = isDomesticToken(fiatToken) ? (ALFREDPAY_FIAT_TOKEN_TO_COUNTRY[fiatToken] ?? null) : null;
  return { country, ...useFiatAccounts(country ?? "", { enabled: !!country }) };
}

export function useAddFiatAccount(country: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: DomesticAddFiatAccountRequest) => AlfredpayService.addFiatAccount(payload),
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
