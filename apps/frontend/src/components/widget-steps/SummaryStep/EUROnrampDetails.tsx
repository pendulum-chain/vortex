import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { EvmToken } from "@vortexfi/shared";
import { useSelector } from "@xstate/react";
import { QRCodeSVG } from "qrcode.react";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { AlertBanner } from "../../AlertBanner";
import { CopyButton } from "../../CopyButton";
import { InfoBox } from "../../InfoBox";

export const EUROnrampDetails: FC = () => {
  const { t } = useTranslation();
  const rampActor = useRampActor();
  const { isQuoteExpired, rampState, signingPhase } = useSelector(rampActor, state => ({
    isQuoteExpired: state.context.isQuoteExpired,
    rampState: state.context.rampState,
    signingPhase: state.context.rampSigningPhase
  }));

  if (!rampState?.ramp?.depositQrCode) return null;

  if (!rampState?.ramp?.ibanPaymentData) return null;
  if (signingPhase !== "finished") return null; // Only show details if the ramp is finished
  if (isQuoteExpired) return null;

  const { iban, bic, receiverName } = rampState.ramp.ibanPaymentData;
  const amount = rampState.quote.inputAmount;

  return (
    <section>
      <hr className="my-5" />
      <h1 className="text-center font-bold text-lg">{t("components.SummaryPage.EUROnrampDetails.title")}</h1>
      <InfoBox className="my-4 p-3">
        <div className="flex items-center justify-between">
          <span>{t("components.SummaryPage.EUROnrampDetails.amount")}</span>
          <strong>{amount} EUR</strong>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span>{t("components.SummaryPage.EUROnrampDetails.receiver")}</span>
          <div className="flex items-center">
            <CopyButton text={receiverName} />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span>{t("components.SummaryPage.EUROnrampDetails.iban")}</span>
          <div className="flex items-center">
            <CopyButton text={iban} />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span>{t("components.SummaryPage.EUROnrampDetails.bic")}</span>
          <div className="flex items-center">
            <CopyButton text={bic} />
          </div>
        </div>
      </InfoBox>
      {rampState.quote.outputCurrency === EvmToken.ETH && (
        <AlertBanner
          className="my-4"
          icon={<ExclamationTriangleIcon className="h-5 w-5 text-warning" />}
          title="When buying a non-stablecoin asset, you have to use instant SEPA. Otherwise your ramp might fail due to the delay."
        />
      )}
      {rampState.ramp?.depositQrCode && (
        <div className="my-6 flex justify-center">
          <InfoBox>
            <QRCodeSVG value={rampState.ramp?.depositQrCode} />
          </InfoBox>
        </div>
      )}
      <p className="text-center">{t("components.SummaryPage.EUROnrampDetails.hint")}</p>
      <p className="text-center">{t("components.SummaryPage.EUROnrampDetails.footer")}</p>
    </section>
  );
};
