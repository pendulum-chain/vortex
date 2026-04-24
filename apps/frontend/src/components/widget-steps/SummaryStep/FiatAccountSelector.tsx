import { CheckIcon, PlusIcon } from "@heroicons/react/24/solid";
import type { AlfredpayFiatAccount } from "@vortexfi/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { FiatAccountTypeKey } from "../../../constants/fiatAccountMethods";
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_LABELS, resolveAccountTypeKey } from "../../../constants/fiatAccountMethods";
import { useFiatAccountActor, useFiatAccountSelector } from "../../../contexts/FiatAccountMachineContext";
import { useAlfredpayFiatAccounts } from "../../../hooks/alfredpay/useFiatAccounts";
import { DropdownSelector } from "../../ui/DropdownSelector";

function accountLabel(account: AlfredpayFiatAccount) {
  return account.fiatAccountFields.accountName || account.fiatAccountFields.metadata?.accountHolderName;
}

function AccountOption({
  account,
  country,
  selected,
  onSelect
}: {
  account: AlfredpayFiatAccount;
  country: string | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const accountType = resolveAccountTypeKey(account.type, country);
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

export function FiatAccountSelector() {
  const { t } = useTranslation();
  const { country, data: accounts = [], isLoading } = useAlfredpayFiatAccounts();
  const fiatAccountActor = useFiatAccountActor();
  const selectedFiatAccountId = useFiatAccountSelector(s => s.context.selectedFiatAccountId);
  const [open, setOpen] = useState(false);

  const selectedAccount = accounts.find(a => a.fiatAccountId === selectedFiatAccountId) ?? accounts[0] ?? null;

  if (!country) return null;

  if (!isLoading && accounts.length === 0) {
    return (
      <div className="mt-4 mb-32">
        <p className="mb-2 font-medium text-gray-700 text-sm">{t("components.fiatAccountSelector.label")}</p>
        <button
          className="flex min-h-[44px] w-full cursor-pointer touch-manipulation items-center gap-2 rounded-xl border border-base-300 bg-base-200 px-3 py-2.5 text-secondary-content text-sm transition-colors [@media(hover:hover)]:hover:bg-neutral [@media(hover:hover)]:hover:text-gray-700"
          onClick={() => fiatAccountActor.send({ country, type: "OPEN" })}
          type="button"
        >
          <PlusIcon aria-hidden="true" className="h-4 w-4" />
          {t("components.fiatAccountSelector.manage")}
        </button>
      </div>
    );
  }

  const accountType: FiatAccountTypeKey | null = selectedAccount
    ? (resolveAccountTypeKey(selectedAccount.type, country) ?? null)
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
      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
        {t("components.fiatAccountSelector.selected")}
      </span>
    </>
  ) : (
    <p className="text-secondary-content text-sm">{t("components.fiatAccountSelector.noPaymentMethods")}</p>
  );

  return (
    <DropdownSelector
      className="mt-4 mb-32"
      isLoading={isLoading}
      label={t("components.fiatAccountSelector.label")}
      onOpenChange={setOpen}
      open={open}
      triggerContent={triggerContent}
    >
      {accounts.length > 0 && (
        <div>
          {accounts.map(account => (
            <AccountOption
              account={account}
              country={country}
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
          {t("components.fiatAccountSelector.manage")}
        </button>
      </div>
    </DropdownSelector>
  );
}
