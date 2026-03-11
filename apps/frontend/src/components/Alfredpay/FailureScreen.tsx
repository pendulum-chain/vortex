import { memo } from "react";
import { useTranslation } from "react-i18next";
import XError from "../../assets/exclamation_mark_error.svg";
import { StepFooter } from "../StepFooter";

interface FailureScreenProps {
  errorMessage: string | undefined;
  onRetry: () => void;
  onCancel: () => void;
}

export const FailureScreen = memo(({ errorMessage, onRetry, onCancel }: FailureScreenProps) => {
  const { t } = useTranslation();

  return (
    <div className="relative flex min-h-(--widget-min-height) w-full grow flex-col justify-center gap-8">
      <img alt="Error icon" className="mx-auto h-[140px] w-[140px]" src={XError} />
      <p className="text-center text-red-800">{errorMessage ?? "An unknown error occurred."}</p>
      <StepFooter hideQuoteSummary>
        <div className="flex w-full flex-col gap-2">
          <button className="btn-vortex-primary btn w-full rounded-xl" onClick={onRetry}>
            {t("components.alfredpayKycFlow.retryProcess")}
          </button>
          <button className="btn-vortex-danger btn w-full rounded-xl" onClick={onCancel}>
            {t("components.alfredpayKycFlow.cancel")}
          </button>
        </div>
      </StepFooter>
    </div>
  );
});

FailureScreen.displayName = "FailureScreen";
