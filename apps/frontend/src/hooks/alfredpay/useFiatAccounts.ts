import { useMutation } from "@tanstack/react-query";
import type { AlfredpayAddFiatAccountRequest } from "@vortexfi/shared";
import { useEffect } from "react";
import { AlfredpayService } from "../../services/api/alfredpay.service";
import {
  useFiatAccountsActions,
  useFiatAccountsForCountry,
  useFiatAccountsLoadingForCountry
} from "../../stores/fiatAccountsStore";

export function useFiatAccounts(country: string, options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && !!country;
  const accounts = useFiatAccountsForCountry(country);
  const isLoading = useFiatAccountsLoadingForCountry(country);
  const { fetchAccounts } = useFiatAccountsActions();

  useEffect(() => {
    if (enabled) fetchAccounts(country);
  }, [country, enabled, fetchAccounts]);

  return {
    data: accounts,
    isLoading: isLoading || (enabled && accounts === undefined)
  };
}

export function useAddFiatAccount(country: string) {
  const { fetchAccounts } = useFiatAccountsActions();
  return useMutation({
    mutationFn: (payload: AlfredpayAddFiatAccountRequest) => AlfredpayService.addFiatAccount(payload),
    onSuccess: () => fetchAccounts(country, true)
  });
}

export function useDeleteFiatAccount(country: string) {
  const { fetchAccounts } = useFiatAccountsActions();
  return useMutation({
    mutationFn: (fiatAccountId: string) => AlfredpayService.deleteFiatAccount(fiatAccountId, country),
    onSuccess: () => fetchAccounts(country, true)
  });
}
