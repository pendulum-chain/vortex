import { FiatToken } from "@packages/shared";
import { EvmToken, Networks, RampDirection } from "@vortexfi/shared";
import { getLanguageFromPath, Language } from "../../../../translations/helpers";
import { FeeComparisonHeader } from "./components/FeeComparisonHeader";
import { FeeComparisonProviderList } from "./components/FeeComparisonProviderList";

const FEE_COMPARISON_CRYPTO = EvmToken.USDC;
const FEE_COMPARISON_DIRECTION = RampDirection.BUY;

export function FeeComparisonTable() {
  const language = getLanguageFromPath();
  const isBrazilian = language === Language.Portuguese_Brazil;

  // BRL requires Moonbeam, EUR uses Polygon
  const fiatCurrency = isBrazilian ? FiatToken.BRL : FiatToken.EURC;
  const network = Networks.Base;
  const amount = isBrazilian ? "500" : "100";

  const targetAssetSymbol = FEE_COMPARISON_CRYPTO;
  const sourceAssetSymbol = fiatCurrency;

  return (
    <div className="rounded-xl bg-white p-4 pb-8 shadow-xl transition-all duration-300 hover:scale-101">
      <FeeComparisonHeader amount={amount} sourceAssetSymbol={sourceAssetSymbol} targetAssetSymbol={targetAssetSymbol} />
      <FeeComparisonProviderList
        amount={amount}
        direction={FEE_COMPARISON_DIRECTION}
        network={network}
        sourceAssetSymbol={sourceAssetSymbol}
        targetAssetSymbol={targetAssetSymbol}
      />
    </div>
  );
}
