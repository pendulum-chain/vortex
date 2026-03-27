import type { AlfredpayFiatAccount } from "@vortexfi/shared";
import { useTranslation } from "react-i18next";
import { MenuButtons } from "../../../components/MenuButtons";
import { AccountCardDeck } from "./AccountCardDeck";
import { AccountCardSkeleton } from "./AccountCardSkeleton";
import { KycRequiredBanner } from "./KycRequiredBanner";

interface RegisteredAccountsListProps {
  accounts: AlfredpayFiatAccount[];
  isLoading: boolean;
  kycApproved: boolean;
  onAddNew: () => void;
  onDelete: (fiatAccountId: string) => void;
}

export function RegisteredAccountsList({ accounts, isLoading, kycApproved, onAddNew, onDelete }: RegisteredAccountsListProps) {
  const { t } = useTranslation();
  return (
    <div className="relative flex grow-1 flex-col">
      <h2 className="mt-4 mb-4 text-center font-bold text-3xl text-primary">{t("components.fiatAccountRegistration.title")}</h2>
      {!kycApproved && <KycRequiredBanner />}

      <div className="mt-8">
        {isLoading ? (
          <AccountCardSkeleton />
        ) : accounts.length === 0 ? (
          <p className="py-6 text-center text-gray-500 text-sm">
            {t("components.fiatAccountRegistration.noAccountsConfigured")}
          </p>
        ) : (
          <AccountCardDeck accounts={accounts} onDelete={onDelete} />
        )}
      </div>

      <button className="btn btn-vortex-primary-inverse my-8 w-full" disabled={!kycApproved} onClick={onAddNew} type="button">
        {t("components.fiatAccountRegistration.addNew")}
      </button>
    </div>
  );
}
