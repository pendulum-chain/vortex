import {
  FiatToken,
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getOnChainTokenDetailsOrDefault,
  OnChainToken,
  RampDirection,
  RampPhase
} from "@packages/shared";
import { TFunction } from "i18next";
import { RampState } from "../../types/phases";

export function getMessageForPhase(ramp: RampState | undefined, t: TFunction<"translation", undefined>): string {
  if (!ramp || !ramp.ramp) return t("pages.progress.initial");

  const currentState = ramp.ramp;
  const quote = ramp.quote;
  const currentPhase = currentState.currentPhase;

  const fromNetwork = getNetworkFromDestination(quote.from);
  const toNetwork = getNetworkFromDestination(quote.to);

  const inputAssetSymbol =
    currentState.type === RampDirection.SELL
      ? fromNetwork
        ? getOnChainTokenDetailsOrDefault(fromNetwork, quote.inputCurrency as OnChainToken).assetSymbol
        : "Unknown" // Fallback when network is undefined
      : getAnyFiatTokenDetails(quote.inputCurrency as FiatToken).assetSymbol;

  const outputAssetSymbol =
    currentState.type === RampDirection.SELL
      ? getAnyFiatTokenDetails(quote.outputCurrency as FiatToken).assetSymbol
      : toNetwork
        ? getOnChainTokenDetailsOrDefault(toNetwork, quote.outputCurrency as OnChainToken).assetSymbol
        : "Unknown"; // Fallback when network is undefined

  if (currentPhase === "complete") return t("pages.progress.success");

  const getSwappingMessage = () => t("pages.progress.swappingTo", { assetSymbol: outputAssetSymbol });
  const getMoonbeamToPendulumMessage = () => t("pages.progress.moonbeamToPendulum", { assetSymbol: inputAssetSymbol });
  const getSquidrouterSwapMessage = () =>
    t("pages.progress.squidRouterSwap", {
      assetSymbol: outputAssetSymbol,
      fromNetwork: quote.inputCurrency === FiatToken.EURC ? "Polygon" : "Moonbeam",
      toNetwork: toNetwork
    });

  const getTransferringMessage = () => t("pages.progress.transferringToLocalPartner");

  const messages: Record<RampPhase, string> = {
    assethubToPendulum: t("pages.progress.assethubToPendulum", {
      assetSymbol: inputAssetSymbol
    }),
    brlaOnrampMint: t("pages.progress.brlaOnrampMint"),
    brlaPayoutOnMoonbeam: getTransferringMessage(),
    complete: "",
    distributeFees: getSwappingMessage(),
    failed: "",
    fundEphemeral: t("pages.progress.fundEphemeral"),
    initial: t("pages.progress.initial"),
    moneriumOnrampMint: t("pages.progress.moneriumOnrampMint"),
    moneriumOnrampSelfTransfer: t("pages.progress.moneriumOnrampSelfTransfer"),
    moonbeamToPendulum: getMoonbeamToPendulumMessage(),
    moonbeamToPendulumXcm: getMoonbeamToPendulumMessage(),
    nablaApprove: getSwappingMessage(),
    nablaSwap: getSwappingMessage(),
    pendulumToAssethubXcm: t("pages.progress.pendulumToAssethubXcm", {
      assetSymbol: outputAssetSymbol
    }),
    pendulumToMoonbeam: t("pages.progress.pendulumToMoonbeam", {
      assetSymbol: outputAssetSymbol
    }),
    spacewalkRedeem: t("pages.progress.executeSpacewalkRedeem", {
      assetSymbol: outputAssetSymbol
    }),
    squidRouterApprove: getSquidrouterSwapMessage(),
    squidRouterPay: getSquidrouterSwapMessage(),
    squidRouterSwap: getSquidrouterSwapMessage(),
    stellarCreateAccount: t("pages.progress.createStellarAccount"), // Not relevant for progress page
    stellarPayment: t("pages.progress.stellarPayment", {
      assetSymbol: outputAssetSymbol
    }), // Not relevant for progress page
    subsidizePostSwap: getSwappingMessage(),
    subsidizePreSwap: getSwappingMessage(),
    timedOut: "" // Not relevant for progress page
  };

  return messages[currentPhase];
}
