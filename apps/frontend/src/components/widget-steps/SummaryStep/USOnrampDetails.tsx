import { useSelector } from "@xstate/react";
import { QRCodeSVG } from "qrcode.react";
import { FC } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { CopyButton } from "../../CopyButton";

export const USOnrampDetails: FC = () => {
  const { t } = useTranslation();
  const rampActor = useRampActor();
  const { isQuoteExpired } = useSelector(rampActor, state => ({
    isQuoteExpired: state.context.isQuoteExpired
  }));
  console.log("loading");
  const { rampState } = useSelector(rampActor, state => ({
    rampState: state.context.rampState
  }));
  if (!rampState?.ramp?.achPaymentData) return null;
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
        <div className="rounded-lg border-1 border-gray-300 p-4">
          <p>{rampState.ramp?.achPaymentData.paymentDescription!}</p>
          <p>{rampState.ramp?.achPaymentData.accountNumber!}</p>
          <p>{rampState.ramp?.achPaymentData.routingNumber!}</p>
          <p>{rampState.ramp?.achPaymentData.accountHolderName!}</p>
        </div>
      </div>
      <p className="text-center">{t("components.SummaryPage.USOnrampDetails.copyCode")}</p>
    </>
  );
};
