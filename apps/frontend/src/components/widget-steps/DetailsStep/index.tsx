import { QuoteResponse } from "@packages/shared";
import { FormProvider } from "react-hook-form";
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
  const { shouldDisplay: signingBoxVisible, progress, signatureState, confirmations } = useSigningBoxState();

  const { address } = useVortexAccount();
  const taxId = useTaxId();
  const pixId = usePixId();
  const quote = useQuote();

  const { form } = useRampForm({
    pixId,
    taxId,
    walletAddress: address
  });

  const { onRampConfirm } = useRampSubmission();

  const signingState: SigningState = {
    confirmations,
    progress,
    shouldDisplay: signingBoxVisible,
    signatureState
  };

  const isBrazilLanding = quote?.from === "pix" || quote?.to === "pix";

  const handleFormSubmit = (data: FormData) => {
    onRampConfirm(data);
  };

  return (
    <FormProvider {...form}>
      <form className={`flex grow flex-col ${className || ""}`} onSubmit={form.handleSubmit(handleFormSubmit)}>
        <DetailsStepHeader />
        <DetailsStepForm isBrazilLanding={isBrazilLanding} signingState={signingState} />
        <DetailsStepActions signingState={signingState} />
      </form>
      <DetailsStepQuoteSummary quote={quote} />
    </FormProvider>
  );
};
