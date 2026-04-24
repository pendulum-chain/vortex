import {
  FiatToken,
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getOnChainTokenDetailsOrDefault,
  Networks,
  OnChainToken,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
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
  const getSquidRouterPermitMessage = () =>
    t("pages.progress.squidRouterPermitExecute", {
      assetSymbol: inputAssetSymbol,
      fromNetwork: quote.from
    });
  const getSquidRouterSwapMessage = () =>
    t("pages.progress.squidRouterSwap", {
      assetSymbol: outputAssetSymbol,
      fromNetwork: quote.inputCurrency === FiatToken.EURC ? "Polygon" : "Moonbeam",
      toNetwork: quote.to === Networks.AssetHub ? "Moonbeam" : toNetwork
    });

  const getTransferringMessage = () => t("pages.progress.transferringToLocalPartner");
  const getDestinationTransferMessage = () => t("pages.progress.destinationTransfer", { assetSymbol: outputAssetSymbol });

  const messages: Record<RampPhase, string> = {
    alfredpayOfframpTransfer: getTransferringMessage(),
    alfredpayOnrampMint: t("pages.progress.alfredpayOnrampMint"),
    assethubToPendulum: t("pages.progress.assethubToPendulum", {
      assetSymbol: inputAssetSymbol
    }), // Not relevant for progress page
    backupApprove: "", // Not relevant for progress page
    backupSquidRouterApprove: "",
    backupSquidRouterSwap: "",
    brlaOnrampMint: t("pages.progress.brlaOnrampMint"), // Not relevant for progress page
    brlaPayoutOnMoonbeam: getTransferringMessage(),
    complete: "",
    destinationTransfer: getDestinationTransferMessage(), // Not relevant for progress page
    distributeFees: getSwappingMessage(),
    failed: "",
    finalSettlementSubsidy: getDestinationTransferMessage(),
    fundEphemeral: t("pages.progress.fundEphemeral"),
    hydrationSwap: t("pages.progress.hydrationSwap", {
      inputAssetSymbol: "USDC",
      outputAssetSymbol: outputAssetSymbol
    }),
    hydrationToAssethubXcm: t("pages.progress.hydrationToAssethubXcm", {
      assetSymbol: outputAssetSymbol
    }),
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
    pendulumToHydrationXcm: t("pages.progress.pendulumToHydrationXcm", {
      assetSymbol: "USDC" // Always USDC because of the logic of our flow
    }),
    pendulumToMoonbeamXcm: t("pages.progress.pendulumToMoonbeamXcm", {
      assetSymbol: outputAssetSymbol
    }),
    spacewalkRedeem: t("pages.progress.executeSpacewalkRedeem", {
      assetSymbol: outputAssetSymbol
    }),
    squidRouterApprove: getSquidRouterSwapMessage(),
    squidRouterPay: getSquidRouterSwapMessage(),
    squidRouterPermitExecute: getSquidRouterPermitMessage(),
    squidRouterSwap: getSquidRouterSwapMessage(),
    stellarCreateAccount: t("pages.progress.createStellarAccount"),
    stellarPayment: t("pages.progress.stellarPayment", {
      assetSymbol: outputAssetSymbol
    }),
    subsidizePostSwap: getSwappingMessage(), // Not relevant for progress page
    subsidizePreSwap: getSwappingMessage(),
    timedOut: ""
  };

  return messages[currentPhase];
}
