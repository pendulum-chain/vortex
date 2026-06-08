import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";

export function isEurToEurcBaseDirect(inputCurrency: string, outputCurrency: string, toNetwork: string): boolean {
  return inputCurrency === FiatToken.EURC && outputCurrency === EvmToken.EURC && toNetwork === Networks.Base;
}

export function isBrlToBrlaBaseDirect(inputCurrency: string, outputCurrency: string, toNetwork: string): boolean {
  return inputCurrency === FiatToken.BRL && outputCurrency === EvmToken.BRLA && toNetwork === Networks.Base;
}

// Fiat -> own-stablecoin passthrough on Base (EUR->EURC, BRL->BRLA): the anchor already minted the
// requested stablecoin, so the swap/bridge/subsidy steps are skipped and funds transfer directly.
export function isFiatToOwnStablecoinBaseDirect(inputCurrency: string, outputCurrency: string, toNetwork: string): boolean {
  return (
    isEurToEurcBaseDirect(inputCurrency, outputCurrency, toNetwork) ||
    isBrlToBrlaBaseDirect(inputCurrency, outputCurrency, toNetwork)
  );
}
