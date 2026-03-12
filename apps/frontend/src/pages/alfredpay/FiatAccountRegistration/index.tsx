import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { MenuButtons } from "../../../components/MenuButtons";
import { ALFREDPAY_COUNTRY_METHODS, type CountryFiatAccountConfig } from "../../../constants/fiatAccountMethods";
import { useFiatAccountActor, useFiatAccountSelector } from "../../../contexts/FiatAccountMachineContext";
import { useDeleteFiatAccount, useFiatAccounts } from "../../../hooks/alfredpay/useFiatAccounts";
import { AccountTypePickerScreen } from "./AccountTypePickerScreen";
import { RegisteredAccountsList } from "./RegisteredAccountsList";
import { RegisterFiatAccountScreen } from "./RegisterFiatAccountScreen";

interface FiatAccountRegistrationProps {
  kycApproved: boolean;
  preselectedCountry: string;
}

export function FiatAccountRegistration({ kycApproved, preselectedCountry }: FiatAccountRegistrationProps) {
  const { t } = useTranslation();
  const selectedCountry = ALFREDPAY_COUNTRY_METHODS.find(c => c.country === preselectedCountry) ?? ALFREDPAY_COUNTRY_METHODS[0];

  const { data: accounts = [], isLoading } = useFiatAccounts(selectedCountry.country);
  const deleteMutation = useDeleteFiatAccount(selectedCountry.country);

  const actor = useFiatAccountActor();
  const matchesPickAccountType = useFiatAccountSelector(s => s.matches({ Open: "PickAccountType" }));
  const matchesRegisterAccount = useFiatAccountSelector(s => s.matches({ Open: "RegisterAccount" }));
  const matchesAccountsList = useFiatAccountSelector(s => s.matches({ Open: "AccountsList" }));
  const selectedAccountType = useFiatAccountSelector(s => s.context.selectedAccountType);

  const handleDelete = async (fiatAccountId: string) => {
    try {
      await deleteMutation.mutateAsync(fiatAccountId);
      toast.success(t("components.fiatAccountRegistration.removedSuccess"));
    } catch {
      toast.error(t("components.fiatAccountRegistration.removeError"));
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
      {matchesPickAccountType && (
        <AccountTypePickerScreen
          countryConfig={selectedCountry}
          onSelect={accountType => actor.send({ accountType, type: "SELECT_ACCOUNT_TYPE" })}
        />
      )}
      {matchesRegisterAccount && selectedAccountType && (
        <RegisterFiatAccountScreen
          accountType={selectedAccountType}
          country={selectedCountry.country}
          onSuccess={() => actor.send({ type: "REGISTER_DONE" })}
        />
      )}
      {matchesAccountsList && (
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
