import { CheckIcon } from "@heroicons/react/20/solid";
import { FiatToken } from "@packages/shared";
import { useSelector } from "@xstate/react";
import { useTranslation } from "react-i18next";
import { Box } from "../../components/Box";
import { EmailForm } from "../../components/EmailForm";
import { Rating } from "../../components/Rating";
import { useRampActor } from "../../contexts/rampState";
import { useRampSubmission } from "../../hooks/ramp/useRampSubmission";
import { useRampFormStore } from "../../stores/ramp/useRampFormStore";
import { useRampDirection } from "../../stores/rampDirectionStore";

const Checkmark = () => (
  <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-blue-700">
    <CheckIcon className="w-10 text-blue-700" /> {/* Changed pink to blue */}
  </div>
);

export const SuccessPage = () => {
  const { t } = useTranslation();
  const rampActor = useRampActor();

  const { fiatToken } = useRampFormStore();
  const rampDirection = useRampDirection();
  const isOnramp = rampDirection === "onramp";

  const { executionInput } = useSelector(rampActor, state => ({
    executionInput: state.context.executionInput
  }));

  const transactionId = executionInput?.quote?.id;

  const ARRIVAL_TEXT_BY_TOKEN: Record<FiatToken, string> = {
    [FiatToken.EURC]: t("pages.success.arrivalText.sell.EURC"),
    [FiatToken.ARS]: t("pages.success.arrivalText.sell.ARS"),
    [FiatToken.BRL]: t("pages.success.arrivalText.sell.BRL")
  };

  const arrivalTextBuy = t("pages.success.arrivalText.buy");
  const arrivalTextSell = ARRIVAL_TEXT_BY_TOKEN[fiatToken] || t("pages.success.arrivalText.sell.default");

  const finishOfframping = () => {
    rampActor.send({ type: "FINISH_OFFRAMPING" });
  };

  return (
    <main>
      <Box className="mx-auto mt-12 flex flex-col justify-center ">
        <div className="flex w-full justify-center">
          <Checkmark />
        </div>
        <div className="mt-6 w-full px-4 md:px-8">
          {" "}
          <h1 className="mb-6 text-left font-bold text-2xl text-blue-700">
            {t(`pages.success.title.${isOnramp ? "buy" : "sell"}`)}
          </h1>{" "}
          <p className="mb-8 text-left font-light text-blue-700 leading-relaxed">
            {isOnramp ? arrivalTextBuy : arrivalTextSell}
          </p>{" "}
          <div className="m-auto mt-8 mb-5 h-0.5 w-1/5 bg-pink-500" />
          <EmailForm transactionId={transactionId} transactionSuccess={true} />
        </div>
        <button className="btn-vortex-primary btn mt-5 w-full rounded-xl" onClick={finishOfframping}>
          {t("pages.success.returnHome")}
        </button>
      </Box>
      <Rating />
    </main>
  );
};
