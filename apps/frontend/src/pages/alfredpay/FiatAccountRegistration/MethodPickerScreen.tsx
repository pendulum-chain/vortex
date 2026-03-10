import {
  type CountryPaymentConfig,
  METHOD_DESCRIPTIONS,
  METHOD_ICONS,
  METHOD_LABELS,
  type PaymentMethodKey
} from "../../../constants/alfredPayMethods";

interface MethodPickerScreenProps {
  countryConfig: CountryPaymentConfig;
  onSelect: (method: PaymentMethodKey) => void;
}

function MethodRow({ method }: { method: PaymentMethodKey }) {
  const Icon = METHOD_ICONS[method];
  return (
    <div className="flex items-center gap-3">
      <Icon aria-hidden="true" className="h-7 w-7 shrink-0 text-black" />
      <div>
        <p className="font-semibold text-gray-900 text-sm">{METHOD_LABELS[method]}</p>
        <p className="mt-0.5 text-gray-500 text-xs">{METHOD_DESCRIPTIONS[method]}</p>
      </div>
    </div>
  );
}

export function MethodPickerScreen({ countryConfig, onSelect }: MethodPickerScreenProps) {
  const methods = [...new Set([...countryConfig.onramp, ...countryConfig.offramp])] as PaymentMethodKey[];

  return (
    <div className="px-1">
      <h1 className="mt-4 mb-4 text-center font-bold text-3xl text-blue-700">Choose a payment method</h1>

      <div className="space-y-3">
        {methods.map(method => (
          <button
            className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-4 text-left shadow-sm transition-colors hover:border-primary hover:bg-blue-100"
            key={method}
            onClick={() => onSelect(method)}
            type="button"
          >
            <MethodRow method={method} />
            <span className="ml-4 text-gray-400 text-lg">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
