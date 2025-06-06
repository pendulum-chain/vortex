import { useTranslation } from 'react-i18next';
import { isNetworkEVM, getNetworkDisplayName } from 'shared';
import { useNetwork } from '../../../../contexts/network';

interface FeeComparisonHeaderProps {
  amount: string;
  sourceAssetSymbol: string;
  targetAssetSymbol: string;
}

export function FeeComparisonHeader({ amount, sourceAssetSymbol }: FeeComparisonHeaderProps) {
  const { selectedNetwork } = useNetwork();
  const { t } = useTranslation();

  const networkDisplay = !isNetworkEVM(selectedNetwork) ? (
    <div
      className="tooltip tooltip-primary before:whitespace-pre-wrap before:content-[attr(data-tip)]"
      data-tip={t('sections.feeComparison.table.tooltip', { network: getNetworkDisplayName(selectedNetwork) })}
    >
      <span translate="no">(Polygon)</span>
    </div>
  ) : null;

  return (
    <div className="flex items-center justify-center w-full mb-3">
      <div className="flex items-center justify-center w-full gap-4">
        <span className="font-bold text-md">
          {t('sections.feeComparison.table.sending')} {Number(amount).toFixed(2)} {sourceAssetSymbol} {networkDisplay}{' '}
          {t('sections.feeComparison.table.with')}
        </span>
      </div>
      <div className="flex flex-col items-center justify-center w-full">
        <span className="font-bold text-md">{t('sections.feeComparison.table.recipientGets')}</span>
        <span className="text-sm">{t('sections.feeComparison.table.totalAfterFees')}</span>
      </div>
    </div>
  );
}
