import { ArrowDownIcon } from "@heroicons/react/20/solid";
import {
  BaseFiatTokenDetails,
  FiatTokenDetails,
  OnChainTokenDetails,
  getAddressForFormat,
  getAnyFiatTokenDetails,
  getOnChainTokenDetailsOrDefault,
  isStellarOutputTokenDetails
} from "@packages/shared";
import Big from "big.js";
import { FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNetwork } from "../../contexts/network";
import { useAssetHubNode } from "../../contexts/polkadotNode";
import { trimAddress } from "../../helpers/addressFormatter";
import { useGetAssetIcon } from "../../hooks/useGetAssetIcon";
import { useVortexAccount } from "../../hooks/useVortexAccount";
import { useRampState } from "../../stores/rampStore";
import { useRampSummaryActions } from "../../stores/rampSummary";
import { RampExecutionInput } from "../../types/phases";
import { RampDirection } from "../RampToggle";
import { AssetDisplay } from "./AssetDisplay";
import { BRLOnrampDetails } from "./BRLOnrampDetails";
import { FeeDetails } from "./FeeDetails";

// Define onramp expiry time in minutes. This is not arbitrary, but based on the assumptions imposed by the backend.
const ONRAMP_EXPIRY_MINUTES = 5;

interface TransactionTokensDisplayProps {
  executionInput: RampExecutionInput;
  isOnramp: boolean;
  rampDirection: RampDirection;
}

export const TransactionTokensDisplay: FC<TransactionTokensDisplayProps> = ({ executionInput, isOnramp, rampDirection }) => {
  const { t } = useTranslation();
  const rampState = useRampState();

  const { selectedNetwork } = useNetwork();
  const { apiComponents } = useAssetHubNode();
  const { address, chainId } = useVortexAccount();

  const [timeLeft, setTimeLeft] = useState({
    minutes: ONRAMP_EXPIRY_MINUTES,
    seconds: 0
  });
  const [targetTimestamp, setTargetTimestamp] = useState<number | null>(null);
  const { setIsQuoteExpired } = useRampSummaryActions();

  useEffect(() => {
    let targetTimestamp: number | null = null;

    if (isOnramp) {
      // Onramp: Use ramp creation time + expiry duration
      const createdAt = rampState?.ramp?.createdAt;
      if (createdAt) {
        targetTimestamp = new Date(createdAt).getTime() + ONRAMP_EXPIRY_MINUTES * 60 * 1000;
      }
    } else {
      // Offramp: Use quote expiry time directly
      const expiresAt = executionInput.quote.expiresAt;
      targetTimestamp = new Date(expiresAt).getTime();
    }

    setTargetTimestamp(targetTimestamp);

    if (targetTimestamp === null) {
      // If no valid timestamp, mark as expired immediately
      setTimeLeft({ minutes: 0, seconds: 0 });
      setIsQuoteExpired(true);
      return;
    }

    const intervalId = setInterval(() => {
      const now = Date.now();
      const diff = targetTimestamp - now;

      if (diff <= 0) {
        setTimeLeft({ minutes: 0, seconds: 0 });
        setIsQuoteExpired(true);
        clearInterval(intervalId);
        return;
      }

      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      setTimeLeft({ minutes, seconds });
      setIsQuoteExpired(false);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isOnramp, rampState?.ramp?.createdAt, executionInput.quote.expiresAt, setIsQuoteExpired]);

  const formattedTime = `${timeLeft.minutes}:${timeLeft.seconds < 10 ? "0" : ""}${timeLeft.seconds}`;

  const fromToken = isOnramp
    ? getAnyFiatTokenDetails(executionInput.fiatToken)
    : getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput.onChainToken);

  const toToken = isOnramp
    ? getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput.onChainToken)
    : getAnyFiatTokenDetails(executionInput.fiatToken);

  const fromIcon = useGetAssetIcon(
    isOnramp ? (fromToken as BaseFiatTokenDetails).fiat.assetIcon : (fromToken as OnChainTokenDetails).networkAssetIcon
  );

  const toIcon = useGetAssetIcon(
    isOnramp ? (toToken as OnChainTokenDetails).networkAssetIcon : (toToken as BaseFiatTokenDetails).fiat.assetIcon
  );

  const getPartnerUrl = (): string => {
    const fiatToken = (isOnramp ? fromToken : toToken) as FiatTokenDetails;
    return isStellarOutputTokenDetails(fiatToken) ? fiatToken.anchorHomepageUrl : fiatToken.partnerUrl;
  };

  const destinationAddress = isOnramp
    ? chainId && chainId > 0
      ? trimAddress(address || "")
      : trimAddress(getAddressForFormat(address || "", apiComponents ? apiComponents.ss58Format : 42))
    : undefined;

  return (
    <div className="flex flex-col justify-center">
      <AssetDisplay
        iconAlt={isOnramp ? (fromToken as BaseFiatTokenDetails).fiat.symbol : (fromToken as OnChainTokenDetails).assetSymbol}
        symbol={isOnramp ? (fromToken as BaseFiatTokenDetails).fiat.symbol : (fromToken as OnChainTokenDetails).assetSymbol}
        amount={executionInput.quote.inputAmount}
        iconSrc={fromIcon}
      />
      <ArrowDownIcon className="my-2 h-4 w-4" />
      <AssetDisplay
        amount={executionInput.quote.outputAmount}
        symbol={isOnramp ? (toToken as OnChainTokenDetails).assetSymbol : (toToken as BaseFiatTokenDetails).fiat.symbol}
        iconSrc={toIcon}
        iconAlt={isOnramp ? (toToken as OnChainTokenDetails).assetSymbol : (toToken as BaseFiatTokenDetails).fiat.symbol}
      />
      <FeeDetails
        fromToken={fromToken}
        toToken={toToken}
        partnerUrl={getPartnerUrl()}
        exchangeRate={Big(executionInput.quote.outputAmount).div(executionInput.quote.inputAmount).toFixed(4)}
        feesCost={executionInput.quote.fee}
        direction={rampDirection}
        destinationAddress={destinationAddress}
      />
      <BRLOnrampDetails />
      {targetTimestamp !== null && (
        <div className="my-4 text-center font-semibold text-gray-600">
          {t("components.dialogs.RampSummaryDialog.BRLOnrampDetails.timerLabel")} <span>{formattedTime}</span>
        </div>
      )}
    </div>
  );
};
