import { useTranslation } from "react-i18next";
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_LABELS, type FiatAccountTypeKey } from "../../../constants/fiatAccountMethods";

interface CardHeaderProps {
  accountType: FiatAccountTypeKey | undefined;
  sub: string;
  compact?: boolean;
}

export function CardHeader({ accountType, sub, compact = false }: CardHeaderProps) {
  const { t } = useTranslation();
  const Icon = accountType ? ACCOUNT_TYPE_ICONS[accountType] : null;

  return (
    <div className="flex w-full select-none items-center justify-between gap-1.5">
      <div className="flex min-w-0 items-center gap-1">
        {Icon && <Icon aria-hidden="true" className={`shrink-0 text-black ${compact ? "h-5 w-5" : "h-6 w-6"}`} />}
        {compact ? (
          <span className="truncate font-medium text-gray-900 text-sm">
            {accountType ? t(ACCOUNT_TYPE_LABELS[accountType]) : null}
          </span>
        ) : (
          <p className="truncate font-medium text-gray-900">{accountType ? t(ACCOUNT_TYPE_LABELS[accountType]) : null}</p>
        )}
      </div>
      {accountType && (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-medium text-xs ${compact ? "text-gray-500" : "bg-success/10 text-success"}`}
        >
          {sub}
        </span>
      )}
    </div>
  );
}
