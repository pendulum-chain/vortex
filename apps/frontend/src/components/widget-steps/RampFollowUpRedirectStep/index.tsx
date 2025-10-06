import { CheckIcon } from "@heroicons/react/20/solid";
import { useSelector } from "@xstate/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { SUCCESS_CALLBACK_DELAY_MS } from "../../../machines/ramp.machine";

const Checkmark = () => (
  <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-blue-700">
    <CheckIcon className="w-10 text-blue-700" />
  </div>
);

export const RampFollowUpRedirectStep = () => {
  const rampActor = useRampActor();
  const { callbackUrl } = useSelector(rampActor, state => state.context);
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(SUCCESS_CALLBACK_DELAY_MS / 1000);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prevCountdown => prevCountdown - 1);
    }, 1000);

    if (countdown === 0) {
      clearInterval(timer);
    }

    return () => clearInterval(timer);
  }, [callbackUrl, countdown]);

  return (
    <>
      <div className="flex w-full justify-center">
        <Checkmark />
      </div>
      <div className="mt-6 w-full">
        <h1 className="mb-6 text-center font-bold text-xl text-blue-700 ">{t("components.RampFollowUpRedirectStep.title")}</h1>
      </div>
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>
          {t("components.RampFollowUpRedirectStep.beforeLink", { countdown })}
          <a href={callbackUrl} style={{ textDecoration: "underline" }}>
            {t("components.RampFollowUpRedirectStep.link")}
          </a>
          {t("components.RampFollowUpRedirectStep.afterLink")}
        </p>
      </div>
    </>
  );
};
