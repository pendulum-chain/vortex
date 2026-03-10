import type { AlfredpayFiatAccount } from "@vortexfi/shared";
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
  return (
    <div className="relative flex grow-1 flex-col">
      <h1 className="mt-4 mb-4 text-center font-bold text-3xl text-blue-700">Payment Methods</h1>
      {!kycApproved && <KycRequiredBanner />}

      <div className="mt-8">
        {isLoading ? (
          <AccountCardSkeleton />
        ) : accounts.length === 0 ? (
          <p className="py-6 text-center text-gray-500 text-sm">No payment methods yet. Add one below.</p>
        ) : (
          <AccountCardDeck accounts={accounts} onDelete={onDelete} />
        )}
      </div>

      <button className="btn btn-vortex-primary-inverse my-8 w-full" disabled={!kycApproved} onClick={onAddNew} type="button">
        + Add a new payment method
      </button>
    </div>
  );
}
