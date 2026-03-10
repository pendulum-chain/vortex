import { useSelector } from "@xstate/react";
import { useState } from "react";
import { toast } from "react-toastify";
import { MenuButtons } from "../../../components/MenuButtons";
import { ALFRED_COUNTRY_METHODS, type CountryPaymentConfig } from "../../../constants/alfredPayMethods";
import { useFiatAccountActor } from "../../../contexts/FiatAccountMachineContext";
import { useDeleteFiatAccount, useFiatAccounts } from "../../../hooks/alfredpay/useFiatAccounts";
import { MethodPickerScreen } from "./MethodPickerScreen";
import { RegisteredAccountsList } from "./RegisteredAccountsList";
import { RegisterFiatAccountScreen } from "./RegisterFiatAccountScreen";

interface FiatAccountRegistrationProps {
  kycApproved: boolean;
  preselectedCountry?: string;
}

export function FiatAccountRegistration({ kycApproved, preselectedCountry }: FiatAccountRegistrationProps) {
  const defaultCountry = ALFRED_COUNTRY_METHODS.find(c => c.country === preselectedCountry) ?? ALFRED_COUNTRY_METHODS[0];

  const [selectedCountry] = useState<CountryPaymentConfig>(defaultCountry);

  const { data: accounts = [], isLoading } = useFiatAccounts(selectedCountry.country);
  const deleteMutation = useDeleteFiatAccount(selectedCountry.country);

  const actor = useFiatAccountActor();
  const state = useSelector(actor, s => s);

  const handleDelete = async (fiatAccountId: string) => {
    try {
      await deleteMutation.mutateAsync(fiatAccountId);
      toast.success("Payment method removed.");
    } catch {
      toast.error("Could not remove account. Please try again.");
    }
  };

  const handleAddNew = () => {
    const methods = [...new Set([...selectedCountry.onramp, ...selectedCountry.offramp])];
    actor.send({ type: "ADD_NEW" });
    if (methods.length === 1) {
      actor.send({ method: methods[0], type: "SELECT_METHOD" });
    }
  };

  return (
    <>
      <MenuButtons />
      {state.matches({ Open: "PickMethod" }) && (
        <MethodPickerScreen
          countryConfig={selectedCountry}
          onSelect={method => actor.send({ method, type: "SELECT_METHOD" })}
        />
      )}
      {state.matches({ Open: "RegisterAccount" }) && state.context.selectedMethod && (
        <RegisterFiatAccountScreen
          country={selectedCountry.country}
          method={state.context.selectedMethod}
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
