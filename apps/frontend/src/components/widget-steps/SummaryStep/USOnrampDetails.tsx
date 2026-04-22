import { useSelector } from "@xstate/react";
import { QRCodeSVG } from "qrcode.react";
import { FC } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { CopyButton } from "../../CopyButton";
import { InfoBox } from "../../InfoBox";

export const USOnrampDetails: FC = () => {
  const { t } = useTranslation();
  const rampActor = useRampActor();
  const { isQuoteExpired } = useSelector(rampActor, state => ({
    isQuoteExpired: state.context.isQuoteExpired
  }));
  const { rampState } = useSelector(rampActor, state => ({
    rampState: state.context.rampState
  }));
  const achPaymentData = rampState?.ramp?.achPaymentData;
  if (!achPaymentData) return null;
  if (isQuoteExpired) return null;

  return (
    <>
      <hr className="my-5" />
      <h2 className="text-center font-bold text-lg">{t("components.SummaryPage.USOnrampDetails.title")}</h2>
      <p className="pt-2 text-center">{t("components.SummaryPage.USOnrampDetails.qrCode")}</p>
      <div className="mt-4 mb-4 flex flex-col items-center rounded-lg bg-blue-50 p-4">
        <p className="text-center">
          <Trans key="components.SummaryPage.USOnrampDetails.qrCodeDescription">
            Once done, please click on <strong>"I have made the payment"</strong>
          </Trans>
        </p>
      </div>
      <div className="my-6 flex justify-center">
        <InfoBox>
          <p>{String(achPaymentData.paymentDescription)}</p>
          <p>{String(achPaymentData.bankAccountNumber)}</p>
          <p>{String(achPaymentData.bankRoutingNumber)}</p>
          <p>{String(achPaymentData.bankBeneficiaryName)}</p>
          <p>{String(achPaymentData.bankBeneficiaryAddress)}</p>
        </InfoBox>
      </div>
      <p className="text-center">{t("components.SummaryPage.USOnrampDetails.copyCode")}</p>
    </>
  );
};
