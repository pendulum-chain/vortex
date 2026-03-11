import { useSelector } from "@xstate/react";
import { useState } from "react";
import { toast } from "react-toastify";
import { MenuButtons } from "../../../components/MenuButtons";
import { ALFREDPAY_COUNTRY_METHODS, type CountryFiatAccountConfig } from "../../../constants/fiatAccountMethods";
import { useFiatAccountActor } from "../../../contexts/FiatAccountMachineContext";
import { useDeleteFiatAccount, useFiatAccounts } from "../../../hooks/alfredpay/useFiatAccounts";
import { AccountTypePickerScreen } from "./AccountTypePickerScreen";
import { RegisteredAccountsList } from "./RegisteredAccountsList";
import { RegisterFiatAccountScreen } from "./RegisterFiatAccountScreen";

interface FiatAccountRegistrationProps {
  kycApproved: boolean;
  preselectedCountry?: string;
}

export function FiatAccountRegistration({ kycApproved, preselectedCountry }: FiatAccountRegistrationProps) {
  const defaultCountry = ALFREDPAY_COUNTRY_METHODS.find(c => c.country === preselectedCountry) ?? ALFREDPAY_COUNTRY_METHODS[0];

  const [selectedCountry] = useState<CountryFiatAccountConfig>(defaultCountry);

  const { data: accounts = [], isLoading } = useFiatAccounts(selectedCountry.country);
  const deleteMutation = useDeleteFiatAccount(selectedCountry.country);

  const actor = useFiatAccountActor();
  const state = useSelector(actor, s => s);

  const handleDelete = async (fiatAccountId: string) => {
    try {
      await deleteMutation.mutateAsync(fiatAccountId);
      toast.success("Fiat account removed.");
    } catch {
      toast.error("Could not remove account. Please try again.");
    }
  };

  const handleAddNew = () => {
    const accountTypes = [...new Set([...selectedCountry.onramp, ...selectedCountry.offramp])];
    actor.send({ type: "ADD_NEW" });
    if (accountTypes.length === 1) {
      actor.send({ accountType: accountTypes[0], type: "SELECT_ACCOUNT_TYPE" });
    }
  };

  return (
    <>
      <MenuButtons />
      {state.matches({ Open: "PickAccountType" }) && (
        <AccountTypePickerScreen
          countryConfig={selectedCountry}
          onSelect={accountType => actor.send({ accountType, type: "SELECT_ACCOUNT_TYPE" })}
        />
      )}
      {state.matches({ Open: "RegisterAccount" }) && state.context.selectedAccountType && (
        <RegisterFiatAccountScreen
          accountType={state.context.selectedAccountType}
          country={selectedCountry.country}
          onSuccess={() => actor.send({ type: "REGISTER_DONE" })}
        />
      )}
      {state.matches({ Open: "AccountsList" }) && (
        <RegisteredAccountsList
          accounts={accounts}
          isLoading={isLoading}
          kycApproved={kycApproved}
          onAddNew={handleAddNew}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}
