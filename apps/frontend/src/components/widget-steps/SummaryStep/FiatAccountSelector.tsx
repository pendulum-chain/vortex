import { CheckIcon, PlusIcon } from "@heroicons/react/24/solid";
import type { AlfredpayFiatAccount } from "@vortexfi/shared";
import { FiatToken } from "@vortexfi/shared";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FiatAccountTypeKey } from "../../../constants/fiatAccountMethods";
import {
  ACCOUNT_TYPE_ICONS,
  ACCOUNT_TYPE_LABELS,
  ALFRED_TO_ACCOUNT_TYPE,
  ALFREDPAY_FIAT_TOKEN_TO_COUNTRY
} from "../../../constants/fiatAccountMethods";
import { useFiatAccountActor, useFiatAccountSelector } from "../../../contexts/FiatAccountMachineContext";
import { useFiatAccounts } from "../../../hooks/alfredpay/useFiatAccounts";
import { DropdownSelector } from "../../ui/DropdownSelector";

function accountLabel(account: AlfredpayFiatAccount) {
  return account.fiatAccountFields.accountAlias || account.fiatAccountFields.accountBankCode;
}

function AccountOption({
  account,
  selected,
  onSelect
}: {
  account: AlfredpayFiatAccount;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const accountType = ALFRED_TO_ACCOUNT_TYPE[account.type];
  const Icon = accountType ? ACCOUNT_TYPE_ICONS[accountType] : null;
  const last4 = account.fiatAccountFields.accountNumber.slice(-4);

  return (
    <button
      aria-selected={selected}
      className="flex min-h-[44px] w-full cursor-pointer touch-manipulation items-center gap-3 px-3 py-2.5 text-left transition-colors [@media(hover:hover)]:hover:bg-neutral"
      onClick={onSelect}
      role="option"
      type="button"
    >
      {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-secondary-content" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-gray-900 text-sm">{accountLabel(account)}</p>
        <p className="text-secondary-content text-xs">
          {accountType ? t(ACCOUNT_TYPE_LABELS[accountType]) : account.type} ••••{last4}
        </p>
      </div>
      {selected && <CheckIcon className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}

interface FiatAccountSelectorProps {
  fiatToken: FiatToken;
}

export function FiatAccountSelector({ fiatToken }: FiatAccountSelectorProps) {
  const { t } = useTranslation();
  const country = ALFREDPAY_FIAT_TOKEN_TO_COUNTRY[fiatToken];
  const fiatAccountActor = useFiatAccountActor();
  const selectedFiatAccountId = useFiatAccountSelector(s => s.context.selectedFiatAccountId);
  const [open, setOpen] = useState(false);

  const { data: accounts = [], isLoading } = useFiatAccounts(country ?? "", { enabled: !!country });

  const selectedAccount = accounts.find(a => a.fiatAccountId === selectedFiatAccountId) ?? accounts[0] ?? null;

  useEffect(() => {
    if (!selectedFiatAccountId && accounts.length > 0) {
      fiatAccountActor.send({ id: accounts[0].fiatAccountId, type: "SELECT_ACCOUNT" });
    }
  }, [accounts, selectedFiatAccountId, fiatAccountActor]);

  useEffect(() => {
    if (!isLoading && accounts.length === 0) {
      setOpen(true);
    }
  }, [isLoading, accounts.length]);

  if (!country) return null;

  const accountType: FiatAccountTypeKey | null = selectedAccount
    ? (ALFRED_TO_ACCOUNT_TYPE[selectedAccount.type] ?? null)
    : null;
  const Icon = accountType ? ACCOUNT_TYPE_ICONS[accountType] : null;
  const last4 = selectedAccount?.fiatAccountFields.accountNumber.slice(-4);

  const triggerContent = selectedAccount ? (
    <>
      {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-secondary-content" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-gray-900 text-sm">{accountLabel(selectedAccount)}</p>
        <p className="text-secondary-content text-xs">
          {accountType ? t(ACCOUNT_TYPE_LABELS[accountType]) : selectedAccount.type} ••••{last4}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">Selected</span>
    </>
  ) : (
    <p className="text-secondary-content text-sm">No payment methods</p>
  );

  return (
    <DropdownSelector
      className="mt-4 mb-32"
      isLoading={isLoading}
      label="Payment method"
      onOpenChange={setOpen}
      open={open}
      triggerContent={triggerContent}
    >
      {accounts.length > 0 && (
        <div>
          {accounts.map(account => (
            <AccountOption
              account={account}
              key={account.fiatAccountId}
              onSelect={() => {
                fiatAccountActor.send({ id: account.fiatAccountId, type: "SELECT_ACCOUNT" });
                setOpen(false);
              }}
              selected={selectedFiatAccountId === account.fiatAccountId}
            />
          ))}
        </div>
      )}

      <div className={accounts.length > 0 ? "border-base-300 border-t" : ""}>
        <button
          className="flex min-h-[44px] w-full cursor-pointer touch-manipulation items-center gap-2 px-3 py-2.5 text-secondary-content text-sm transition-colors [@media(hover:hover)]:hover:bg-neutral [@media(hover:hover)]:hover:text-gray-700"
          onClick={() => {
            fiatAccountActor.send({ country, type: "OPEN" });
            setOpen(false);
          }}
          type="button"
        >
          <PlusIcon aria-hidden="true" className="h-4 w-4" />
          Manage payment methods
        </button>
      </div>
    </DropdownSelector>
  );
}
