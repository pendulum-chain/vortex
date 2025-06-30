import {
  FiatToken,
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getOnChainTokenDetailsOrDefault,
  OnChainToken,
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
    currentState.type === "off"
      ? fromNetwork
        ? getOnChainTokenDetailsOrDefault(fromNetwork, quote.inputCurrency as OnChainToken).assetSymbol
        : "Unknown" // Fallback when network is undefined
      : getAnyFiatTokenDetails(quote.inputCurrency as FiatToken).assetSymbol;

  const outputAssetSymbol =
    currentState.type === "off"
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
      network: toNetwork
    });

  const getTransferringMessage = () => t("pages.progress.transferringToLocalPartner");

  const messages: Record<RampPhase, string> = {
    assethubToPendulum: t("pages.progress.assethubToPendulum", {
      assetSymbol: inputAssetSymbol
    }),
    brlaPayoutOnMoonbeam: getTransferringMessage(),
    brlaTeleport: t("pages.progress.brlaTeleport"),
    complete: "",
    distributeFees: getSwappingMessage(),
    failed: "",
    fundEphemeral: t("pages.progress.fundEphemeral"),
    initial: t("pages.progress.initial"),
    moonbeamToPendulum: getMoonbeamToPendulumMessage(),
    moonbeamToPendulumXcm: getMoonbeamToPendulumMessage(),
    nablaApprove: getSwappingMessage(),
    nablaSwap: getSwappingMessage(),
    pendulumToAssethub: t("pages.progress.pendulumToAssethub", {
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
    stellarCreateAccount: t("pages.progress.createStellarAccount"),
    stellarPayment: t("pages.progress.stellarPayment", {
      assetSymbol: outputAssetSymbol
    }),
    subsidizePostSwap: getSwappingMessage(), // Not relevant for progress page
    subsidizePreSwap: getSwappingMessage(), // Not relevant for progress page
    timedOut: "" // Not relevant for progress page
  };

  return messages[currentPhase];
}
