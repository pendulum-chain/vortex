import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { useSelector } from "@xstate/react";
import { useEffect } from "react";
import { FormProvider } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { useRampForm } from "../../../hooks/ramp/useRampForm";
import { useRampSubmission } from "../../../hooks/ramp/useRampSubmission";
import { useSigningBoxState } from "../../../hooks/useSigningBoxState";
import { useVortexAccount } from "../../../hooks/useVortexAccount";
import { usePixId, useTaxId } from "../../../stores/quote/useQuoteFormStore";
import { useQuote } from "../../../stores/quote/useQuoteStore";
import { DetailsStepActions } from "./DetailsStepActions";
import { DetailsStepForm } from "./DetailsStepForm";
import { DetailsStepHeader } from "./DetailsStepHeader";
import { DetailsStepQuoteSummary } from "./DetailsStepQuoteSummary";

export interface DetailsStepProps {
  className?: string;
}

export interface SigningState {
  shouldDisplay: boolean;
  progress: number;
  signatureState: { current: number; max: number };
  confirmations: { current: number; required: number };
}

export interface FormData {
  pixId?: string;
  taxId?: string;
  walletAddress?: string;
}

export const DetailsStep = ({ className }: DetailsStepProps) => {
  const { t } = useTranslation();
  const { shouldDisplay: signingBoxVisible, progress, signatureState, confirmations } = useSigningBoxState();

  const rampActor = useRampActor();
  const { walletLockedFromState, isSep24Redo } = useSelector(rampActor, state => ({
    isSep24Redo: state.context.isSep24Redo,
    walletLockedFromState: state.context.walletLocked
  }));

  const { address } = useVortexAccount();
  const taxId = useTaxId();
  const pixId = usePixId();
  const quote = useQuote();

  const { form } = useRampForm({
    pixId,
    taxId,
    walletAddress: walletLockedFromState || address || undefined
  });

  useEffect(() => {
    if (walletLockedFromState) {
      form.setValue("walletAddress", walletLockedFromState);
    } else if (address) {
      form.setValue("walletAddress", address);
    }
  }, [address, form, walletLockedFromState]);

  const { onRampConfirm } = useRampSubmission();

  const signingState: SigningState = {
    confirmations,
    progress,
    shouldDisplay: signingBoxVisible,
    signatureState
  };

  const isBrazilLanding = quote?.from === "pix" || quote?.to === "pix";
  const canSkipConnection = quote?.from === "pix";

  const handleFormSubmit = (data: FormData) => {
    rampActor.send({
      address: data.walletAddress,
      type: "SET_ADDRESS"
    });

    onRampConfirm(data);
  };

  return (
    <FormProvider {...form}>
      <form className={`flex min-h-[506px] grow flex-col ${className || ""}`} onSubmit={form.handleSubmit(handleFormSubmit)}>
        <DetailsStepHeader />
        <DetailsStepForm
          isBrazilLanding={isBrazilLanding}
          isWalletAddressDisabled={!!walletLockedFromState}
          signingState={signingState}
        />
        {isSep24Redo && (
          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-center space-x-3">
              <InformationCircleIcon className="h-6 w-6 flex-shrink-0 text-blue-500" />
              <p className="text-gray-700 text-sm">{t("pages.widget.details.quoteChangedWarning")}</p>
            </div>
          </div>
        )}
        <DetailsStepActions requiresConnection={!canSkipConnection} signingState={signingState} />
      </form>
      <DetailsStepQuoteSummary quote={quote} />
    </FormProvider>
  );
};
