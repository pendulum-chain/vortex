import { memo } from "react";
import { useTranslation } from "react-i18next";

interface FailureScreenProps {
  errorMessage: string | undefined;
  onRetry: () => void;
  onCancel: () => void;
}

export const FailureScreen = memo(({ errorMessage, onRetry, onCancel }: FailureScreenProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center space-y-4 py-4">
      <p className="text-center text-gray-600">{errorMessage ?? "An unknown error occurred."}</p>
      <div className="flex w-full flex-col gap-2">
        <button className="btn-vortex-primary btn w-full rounded-xl" onClick={onRetry}>
          {t("components.alfredpayKycFlow.retryProcess")}
        </button>
        <button className="btn-vortex-secondary btn w-full rounded-xl" onClick={onCancel}>
          {t("components.alfredpayKycFlow.cancel")}
        </button>
      </div>
    </div>
  );
});

FailureScreen.displayName = "FailureScreen";
