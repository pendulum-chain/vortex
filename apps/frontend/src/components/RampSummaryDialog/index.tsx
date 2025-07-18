import Big from "big.js";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useNetwork } from "../../contexts/network";
import { useSigningBoxState } from "../../hooks/useSigningBoxState";
import { usePartnerId } from "../../stores/partnerStore";
import { useQuoteStore } from "../../stores/ramp/useQuoteStore";
import { useFiatToken, useOnChainToken } from "../../stores/ramp/useRampFormStore";
import { useRampDirection } from "../../stores/rampDirectionStore";
import { useRampActions, useRampExecutionInput, useRampSummaryVisible } from "../../stores/rampStore";
import { Dialog } from "../Dialog";
import { RampDirection } from "../RampToggle";
import { SigningBoxButton, SigningBoxContent } from "../SigningBox/SigningBoxContent";
import { RampSummaryButton } from "./RampSummaryButton";
import { TransactionTokensDisplay } from "./TransactionTokensDisplay";

export const RampSummaryDialog: FC = () => {
  const { t } = useTranslation();
  const { selectedNetwork } = useNetwork();
  const { resetRampState } = useRampActions();
  const executionInput = useRampExecutionInput();
  const visible = useRampSummaryVisible();
  const rampDirection = executionInput?.quote.rampType === "off" ? RampDirection.OFFRAMP : RampDirection.ONRAMP;
  const isOnramp = rampDirection === RampDirection.ONRAMP;
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const { quote, fetchQuote } = useQuoteStore();
  const partnerId = usePartnerId();

  const { shouldDisplay: signingBoxVisible, progress, signatureState, confirmations } = useSigningBoxState();

  if (!visible) return null;
  if (!executionInput) return null;

  const onClose = () => {
    resetRampState();
    fetchQuote({
      fiatToken,
      inputAmount: Big(quote?.inputAmount || "0"),
      onChainToken,
      partnerId: partnerId === null ? undefined : partnerId, // Handle null case,
      rampType: isOnramp ? "on" : "off",
      selectedNetwork
    });
  };

  const headerText = isOnramp
    ? t("components.dialogs.RampSummaryDialog.headerText.buy")
    : t("components.dialogs.RampSummaryDialog.headerText.sell");

  const actions = signingBoxVisible ? (
    <SigningBoxButton confirmations={confirmations} signatureState={signatureState} />
  ) : (
    <RampSummaryButton />
  );

  const content = (
    <>
      <TransactionTokensDisplay executionInput={executionInput} isOnramp={isOnramp} rampDirection={rampDirection} />

      {signingBoxVisible && (
        <div className="mx-auto mt-6 max-w-[320px]">
          <SigningBoxContent progress={progress} />
        </div>
      )}
    </>
  );

  return <Dialog actions={actions} content={content} headerText={headerText} onClose={onClose} visible={visible} />;
};
