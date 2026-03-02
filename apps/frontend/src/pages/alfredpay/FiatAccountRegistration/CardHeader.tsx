import { METHOD_ICONS, METHOD_LABELS, type PaymentMethodKey } from "../../../constants/alfredPayMethods";

interface CardHeaderProps {
  methodKey: PaymentMethodKey | undefined;
  sub: string;
  compact?: boolean;
}

export function CardHeader({ methodKey, sub, compact = false }: CardHeaderProps) {
  const Icon = methodKey ? METHOD_ICONS[methodKey] : null;

  return (
    <div className="flex w-full select-none items-center justify-between gap-1.5">
      <div className="flex min-w-0 items-center gap-1">
        {Icon && <Icon aria-hidden="true" className={`shrink-0 text-black ${compact ? "h-5 w-5" : "h-6 w-6"}`} />}
        {compact ? (
          <span className="truncate font-medium text-gray-900 text-sm">{METHOD_LABELS[methodKey]}</span>
        ) : (
          <p className="truncate font-medium text-gray-900">{METHOD_LABELS[methodKey]}</p>
        )}
      </div>
      {methodKey && (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-medium text-xs ${compact ? "text-gray-500" : "bg-green-100 text-green-700"}`}
        >
          {sub}
        </span>
      )}
    </div>
  );
}
