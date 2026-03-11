import { useTranslation } from "react-i18next";
import {
  ACCOUNT_TYPE_DESCRIPTIONS,
  ACCOUNT_TYPE_ICONS,
  ACCOUNT_TYPE_LABELS,
  type CountryFiatAccountConfig,
  type FiatAccountTypeKey
} from "../../../constants/fiatAccountMethods";

interface AccountTypePickerScreenProps {
  countryConfig: CountryFiatAccountConfig;
  onSelect: (accountType: FiatAccountTypeKey) => void;
}

function AccountTypeRow({ accountType }: { accountType: FiatAccountTypeKey }) {
  const { t } = useTranslation();
  const Icon = ACCOUNT_TYPE_ICONS[accountType];
  return (
    <div className="flex items-center gap-3">
      <Icon aria-hidden="true" className="h-7 w-7 shrink-0 text-black" />
      <div>
        <p className="font-semibold text-gray-900 text-sm">{t(ACCOUNT_TYPE_LABELS[accountType])}</p>
        <p className="mt-0.5 text-gray-500 text-xs">{t(ACCOUNT_TYPE_DESCRIPTIONS[accountType])}</p>
      </div>
    </div>
  );
}

export function AccountTypePickerScreen({ countryConfig, onSelect }: AccountTypePickerScreenProps) {
  const accountTypes = [...new Set([...countryConfig.onramp, ...countryConfig.offramp])] as FiatAccountTypeKey[];

  return (
    <div className="px-1">
      <h1 className="mt-4 mb-4 text-center font-bold text-3xl text-blue-700">Choose a payment method</h1>

      <div className="space-y-3">
        {accountTypes.map(accountType => (
          <button
            className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-4 text-left shadow-sm transition-colors hover:border-primary hover:bg-blue-100"
            key={accountType}
            onClick={() => onSelect(accountType)}
            type="button"
          >
            <AccountTypeRow accountType={accountType} />
            <span className="ml-4 text-gray-400 text-lg">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
