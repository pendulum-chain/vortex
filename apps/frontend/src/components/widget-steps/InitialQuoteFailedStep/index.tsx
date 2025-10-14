import { useSelector } from "@xstate/react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { cn } from "../../../helpers/cn";

interface InitialQuoteFailedStepProps {
  className?: string;
}

export function InitialQuoteFailedStep({ className }: InitialQuoteFailedStepProps) {
  const { t } = useTranslation();
  const rampActor = useRampActor();

  const { callbackUrl, partnerId } = useSelector(rampActor, state => ({
    callbackUrl: state.context.callbackUrl,
    partnerId: state.context.partnerId
  }));

  useEffect(() => {
    if (callbackUrl) {
      console.log(callbackUrl);
      const timer = setTimeout(() => {
        rampActor.send({ type: "RESET_RAMP_CALLBACK" });
      }, 5000); // 5-second delay

      return () => clearTimeout(timer);
    }
  }, [callbackUrl, rampActor.send]);

  const handleTryAgain = () => {
    rampActor.send({ type: "RESET_RAMP" });
  };

  if (callbackUrl) {
    return (
      <div className="flex grow-1 flex-col justify-center">
        <div className="flex flex-grow items-center justify-center text-center">
          <p>{t("components.initialQuoteFailed.invalidParameters")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex grow-1 flex-col justify-center">
      <div className="flex flex-grow items-center justify-center text-center">
        <p>{t("components.initialQuoteFailed.invalidParametersGeneric")}</p>
      </div>
      {!partnerId && (
        <div className="mb-4 grid grid-cols-1 gap-4">
          <button className={cn("btn-vortex-primary btn w-full rounded-xl", className)} onClick={handleTryAgain}>
            {t("components.initialQuoteFailed.tryAgain")}
          </button>
        </div>
      )}
    </div>
  );
}
