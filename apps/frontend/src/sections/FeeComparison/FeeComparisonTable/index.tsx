import { useNetwork } from "../../../contexts/network";
import { useQuoteFormStore } from "../../../stores/quote/useQuoteFormStore";
import { useRampDirection } from "../../../stores/rampDirectionStore";

import { FeeComparisonHeader } from "./components/FeeComparisonHeader";
import { FeeComparisonProviderList } from "./components/FeeComparisonProviderList";
import { getAssetSymbols } from "./utils/assetUtils";

export function FeeComparisonTable() {
  const { onChainToken, fiatToken } = useQuoteFormStore();
  const { selectedNetwork } = useNetwork();
  const rampDirection = useRampDirection();

  const amount = "100";

  const { sourceAssetSymbol, targetAssetSymbol } = getAssetSymbols(rampDirection, selectedNetwork, onChainToken, fiatToken);

  return (
    <div className="rounded-xl bg-white p-4 pb-8 shadow-xl transition-all duration-300 hover:scale-101">
      <FeeComparisonHeader amount={amount} sourceAssetSymbol={sourceAssetSymbol} targetAssetSymbol={targetAssetSymbol} />
      <FeeComparisonProviderList amount={amount} sourceAssetSymbol={sourceAssetSymbol} targetAssetSymbol={targetAssetSymbol} />
    </div>
  );
}
