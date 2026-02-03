import { ArrowDownIcon } from "@heroicons/react/20/solid";
import {
  BaseFiatTokenDetails,
  FiatToken,
  FiatTokenDetails,
  getAddressForFormat,
  getAnyFiatTokenDetails,
  getOnChainTokenDetailsOrDefault,
  isStellarOutputTokenDetails,
  OnChainTokenDetails,
  RampDirection
} from "@vortexfi/shared";
import { useSelector } from "@xstate/react";
import Big from "big.js";
import { FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNetwork } from "../../../contexts/network";
import { useAssetHubNode } from "../../../contexts/polkadotNode";
import { useRampActor } from "../../../contexts/rampState";
import { trimAddress } from "../../../helpers/addressFormatter";
import { useTokenIcon } from "../../../hooks/useTokenIcon";
import { useVortexAccount } from "../../../hooks/useVortexAccount";
import { RampExecutionInput } from "../../../types/phases";
import { AssetDisplay } from "./AssetDisplay";
import { BRLOnrampDetails } from "./BRLOnrampDetails";
import { EUROnrampDetails } from "./EUROnrampDetails";
import { FeeDetails } from "./FeeDetails";

const QUOTE_EXPIRY_TIME = 10;

interface TransactionTokensDisplayProps {
  executionInput: RampExecutionInput;
  isOnramp: boolean;
  rampDirection: RampDirection;
}

export const TransactionTokensDisplay: FC<TransactionTokensDisplayProps> = ({ executionInput, isOnramp, rampDirection }) => {
  const { t } = useTranslation();
  const rampActor = useRampActor();

  const { selectedNetwork } = useNetwork();
  const { apiComponents } = useAssetHubNode();
  const { chainId } = useVortexAccount();

  const [timeLeft, setTimeLeft] = useState({
    minutes: QUOTE_EXPIRY_TIME,
    seconds: 0
  });
  const [targetTimestamp, setTargetTimestamp] = useState<number | null>(null);

  const { connectedWalletAddress, isQuoteExpired, quote, quoteLocked } = useSelector(rampActor, state => ({
    connectedWalletAddress: state.context.connectedWalletAddress,
    isQuoteExpired: state.context.isQuoteExpired,
    quote: state.context.quote,
    quoteLocked: state.context.quoteLocked,
    rampState: state.context.rampState
  }));

  useEffect(() => {
    let targetTimestamp: number | null = null;
    if (!quote) return;

    const expiresAt = quote.expiresAt;
    targetTimestamp = new Date(expiresAt).getTime();

    setTargetTimestamp(targetTimestamp);

    if (targetTimestamp === null) {
      setTimeLeft({ minutes: 0, seconds: 0 });
      return;
    }

    const intervalId = setInterval(() => {
      const now = Date.now();
      const diff = targetTimestamp - now;

      if (diff <= 0) {
        setTimeLeft({ minutes: 0, seconds: 0 });
        rampActor.send({ type: "EXPIRE_QUOTE" });
        clearInterval(intervalId);
        return;
      }

      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      setTimeLeft({ minutes, seconds });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [rampActor.send, quote]);

  const formattedTime = `${timeLeft.minutes}:${timeLeft.seconds < 10 ? "0" : ""}${timeLeft.seconds}`;

  const fromToken = isOnramp
    ? getAnyFiatTokenDetails(executionInput.fiatToken)
    : getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput.onChainToken);

  const toToken = isOnramp
    ? getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput.onChainToken)
    : getAnyFiatTokenDetails(executionInput.fiatToken);

  const fromIconInfo = useTokenIcon(fromToken);
  const toIconInfo = useTokenIcon(toToken);

  const getPartnerUrl = (): string => {
    const fiatToken = (isOnramp ? fromToken : toToken) as FiatTokenDetails;
    if (fromToken.assetSymbol === "EURC") {
      return "https://monerium.com";
    }
    return isStellarOutputTokenDetails(fiatToken) ? fiatToken.anchorHomepageUrl : fiatToken.partnerUrl;
  };

  const destinationAddress = isOnramp
    ? trimAddress(executionInput.sourceOrDestinationAddress || "")
    : chainId && chainId > 0
      ? trimAddress(connectedWalletAddress || "")
      : trimAddress(getAddressForFormat(connectedWalletAddress || "", apiComponents ? apiComponents.ss58Format : 42));

  if (!quote) {
    return null;
  }

  return (
    <div className="flex flex-col justify-center">
      <AssetDisplay
        amount={quote.inputAmount}
        fallbackIconSrc={fromIconInfo.fallbackIconSrc}
        iconSrc={fromIconInfo.iconSrc}
        network={fromIconInfo.network}
        symbol={isOnramp ? (fromToken as BaseFiatTokenDetails).fiat.symbol : (fromToken as OnChainTokenDetails).assetSymbol}
      />
      <ArrowDownIcon className="my-2 h-4 w-4" />
      <AssetDisplay
        amount={quote.outputAmount}
        fallbackIconSrc={toIconInfo.fallbackIconSrc}
        iconSrc={toIconInfo.iconSrc}
        network={toIconInfo.network}
        symbol={isOnramp ? (toToken as OnChainTokenDetails).assetSymbol : (toToken as BaseFiatTokenDetails).fiat.symbol}
      />
      <FeeDetails
        destinationAddress={destinationAddress}
        direction={rampDirection}
        exchangeRate={Big(quote.outputAmount).div(quote.inputAmount).toFixed(4)}
        feesCost={{
          anchor: quote.anchorFeeFiat,
          currency: quote.feeCurrency,
          network: quote.networkFeeFiat,
          partnerMarkup: quote.partnerFeeFiat,
          total: quote.totalFeeFiat,
          vortex: quote.vortexFeeFiat
        }}
        fromToken={fromToken}
        partnerUrl={getPartnerUrl()}
        toToken={toToken}
      />
      {rampDirection === RampDirection.BUY && executionInput.fiatToken === FiatToken.BRL && <BRLOnrampDetails />}
      {rampDirection === RampDirection.BUY && executionInput.fiatToken === FiatToken.EURC && <EUROnrampDetails />}
      {quoteLocked && targetTimestamp !== null && !isQuoteExpired && (
        <div className="my-4 text-center font-semibold text-gray-600">
          {t("components.SummaryPage.BRLOnrampDetails.timerLabel")} <span>{formattedTime}</span>
        </div>
      )}
    </div>
  );
};
