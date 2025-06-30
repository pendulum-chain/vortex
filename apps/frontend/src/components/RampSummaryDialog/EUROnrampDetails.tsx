import { QRCodeSVG } from "qrcode.react";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useRampSigningPhase, useRampState } from "../../stores/rampStore";
import { useIsQuoteExpired } from "../../stores/rampSummary";
import { CopyButton } from "../CopyButton";

export const EUROnrampDetails: FC = () => {
  const { t } = useTranslation();
  const rampState = useRampState();
  const isQuoteExpired = useIsQuoteExpired();
  const signingPhase = useRampSigningPhase();

  if (!rampState?.ramp?.ibanPaymentData) return null;
  if (signingPhase !== "finished") return null; // Only show details if the ramp is finished
  if (isQuoteExpired) return null;

  const { iban, bic } = rampState.ramp.ibanPaymentData;
  const amount = rampState.quote.inputAmount;

  return (
    <section>
      <hr className="my-5" />
      <h1 className="text-center font-bold text-lg">{t("components.dialogs.RampSummaryDialog.EUROnrampDetails.title")}</h1>
      <p className="pt-2 text-center">{t("components.dialogs.RampSummaryDialog.EUROnrampDetails.description")}</p>
      <div className="my-4 rounded-lg border-1 border-gray-300 p-3">
        <div className="flex justify-between items-center">
          <span>{t("components.dialogs.RampSummaryDialog.EUROnrampDetails.amount")}</span>
          <strong>{amount} EUR</strong>
        </div>
        <div className="mt-2 flex justify-between items-center">
          <span>{t("components.dialogs.RampSummaryDialog.EUROnrampDetails.iban")}</span>
          <div className="flex items-center">
            <CopyButton text={iban} />
          </div>
        </div>
        <div className="mt-2 flex justify-between items-center">
          <span>{t("components.dialogs.RampSummaryDialog.EUROnrampDetails.bic")}</span>
          <div className="flex items-center">
            <CopyButton text={bic} />
          </div>
        </div>
      </div>
      {rampState.ramp?.depositQrCode && (
        <div className="my-6 flex justify-center">
          <div className="rounded-lg border-1 border-gray-300 p-4">
            <QRCodeSVG value={rampState.ramp?.depositQrCode} />
          </div>
        </div>
      )}
      <p className="text-center">{t("components.dialogs.RampSummaryDialog.EUROnrampDetails.footer")}</p>
    </section>
  );
};
