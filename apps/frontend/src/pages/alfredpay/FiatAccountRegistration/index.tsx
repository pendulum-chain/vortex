import { useState } from "react";
import { toast } from "react-toastify";
import { ALFRED_COUNTRY_METHODS, type CountryPaymentConfig } from "../../../constants/alfredPayMethods";
import { useDeleteFiatAccount, useFiatAccounts } from "../../../hooks/alfredpay/useFiatAccounts";
import { RegisteredAccountsList } from "./RegisteredAccountsList";

interface FiatAccountRegistrationProps {
  kycApproved: boolean;
  onAddNew: () => void;
  preselectedCountry?: string;
}

export function FiatAccountRegistration({ kycApproved, onAddNew, preselectedCountry }: FiatAccountRegistrationProps) {
  const defaultCountry = ALFRED_COUNTRY_METHODS.find(c => c.country === preselectedCountry) ?? ALFRED_COUNTRY_METHODS[0];

  const [selectedCountry] = useState<CountryPaymentConfig>(defaultCountry);

  const { data: accounts = [], isLoading, isError: accountsError } = useFiatAccounts(selectedCountry.country);
  const deleteMutation = useDeleteFiatAccount(selectedCountry.country);

  const handleDelete = async (fiatAccountId: string) => {
    try {
      await deleteMutation.mutateAsync(fiatAccountId);
      toast.success("Payment method removed.");
    } catch {
      toast.error("Could not remove account. Please try again.");
    }
  };

  return (
    <RegisteredAccountsList
      accounts={accounts}
      isError={accountsError}
      isLoading={isLoading}
      kycApproved={kycApproved}
      onAddNew={onAddNew}
      onDelete={handleDelete}
    />
  );
}
