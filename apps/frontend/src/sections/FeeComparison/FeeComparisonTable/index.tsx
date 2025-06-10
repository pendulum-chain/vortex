import { useNetwork } from '../../../contexts/network';
import { useRampFormStore } from '../../../stores/ramp/useRampFormStore';
import { useRampDirection } from '../../../stores/rampDirectionStore';

import { FeeComparisonHeader } from './components/FeeComparisonHeader';
import { FeeComparisonProviderList } from './components/FeeComparisonProviderList';
import { getAssetSymbols } from './utils/assetUtils';

export function FeeComparisonTable() {
  const { inputAmount, onChainToken, fiatToken } = useRampFormStore();
  const { selectedNetwork } = useNetwork();
  const rampDirection = useRampDirection();

  const amount = inputAmount || '100';

  const { sourceAssetSymbol, targetAssetSymbol } = getAssetSymbols(
    rampDirection,
    selectedNetwork,
    onChainToken,
    fiatToken,
  );

  return (
    <div className="p-4 transition-all pb-8 duration-300 bg-white rounded-2xl shadow-custom hover:scale-[101%]">
      <FeeComparisonHeader
        amount={amount}
        sourceAssetSymbol={sourceAssetSymbol}
        targetAssetSymbol={targetAssetSymbol}
      />

      <FeeComparisonProviderList
        sourceAssetSymbol={sourceAssetSymbol}
        targetAssetSymbol={targetAssetSymbol}
        amount={amount}
      />
    </div>
  );
}
