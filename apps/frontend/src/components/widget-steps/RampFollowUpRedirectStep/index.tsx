import { CheckIcon } from "@heroicons/react/20/solid";
import { useSelector } from "@xstate/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { useCountdown } from "../../../hooks/useCountdown";
import { SUCCESS_CALLBACK_DELAY_MS } from "../../../machines/ramp.machine";

const Checkmark = () => (
  <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary">
    <CheckIcon className="w-10 text-primary" />
  </div>
);

export const RampFollowUpRedirectStep = () => {
  const rampActor = useRampActor();
  const { callbackUrl } = useSelector(rampActor, state => state.context);
  const { t } = useTranslation();

  const [targetMs] = useState(() => Date.now() + SUCCESS_CALLBACK_DELAY_MS);
  const { seconds } = useCountdown(targetMs);

  return (
    <>
      <div className="flex w-full justify-center">
        <Checkmark />
      </div>
      <div className="mt-6 w-full">
        <h1 className="mb-6 text-center font-bold text-primary text-xl">{t("components.RampFollowUpRedirectStep.title")}</h1>
      </div>
      <div className="p-5 text-center">
        <p>
          {t("components.RampFollowUpRedirectStep.beforeLink", { countdown: seconds })}
          <a href={callbackUrl} style={{ textDecoration: "underline" }}>
            {t("components.RampFollowUpRedirectStep.link")}
          </a>
          {t("components.RampFollowUpRedirectStep.afterLink")}
        </p>
      </div>
    </>
  );
};
