import { useSelector } from "@xstate/react";
import { useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { cn } from "../../../helpers/cn";

interface ErrorStepProps {
  className?: string;
}

export function ErrorStep({ className }: ErrorStepProps) {
  const { t } = useTranslation();
  const rampActor = useRampActor();

  const { errorMessage } = useSelector(rampActor, state => ({
    errorMessage: state.context.errorMessage
  }));

  const handleRetry = () => {
    rampActor.send({ type: "RESET_RAMP" });
  };

  return (
    <div className="flex grow-1 flex-col justify-center">
      <div className="flex flex-col gap-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-8 w-8 text-red-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <div className="text-center">
          <h2 className="font-semibold text-gray-900 text-xl">{t("components.errorStep.title")}</h2>
        </div>

        <div className="rounded-lg bg-red-50 p-4">
          <p className="text-center text-red-800 text-sm">{errorMessage || t("components.errorStep.defaultMessage")}</p>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4">
          <button className={cn("btn-vortex-primary btn w-full rounded-xl", className)} onClick={handleRetry}>
            {t("components.errorStep.retryButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
