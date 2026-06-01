import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";

export function isEurToEurcBaseDirect(inputCurrency: string, outputCurrency: string, toNetwork: string): boolean {
  return inputCurrency === FiatToken.EURC && outputCurrency === EvmToken.EURC && toNetwork === Networks.Base;
}
