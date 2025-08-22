import { useSelector } from "@xstate/react";
import { QRCodeSVG } from "qrcode.react";
import { FC } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useRampActor } from "../../contexts/rampState";
import { CopyButton } from "../CopyButton";

export const BRLOnrampDetails: FC = () => {
  const { t } = useTranslation();
  const rampActor = useRampActor();
  const { isQuoteExpired } = useSelector(rampActor, state => ({
    isQuoteExpired: state.context.isQuoteExpired
  }));

  const { rampState } = useSelector(rampActor, state => ({
    rampState: state.context.rampState
  }));
  if (!rampState?.ramp?.depositQrCode) return null;
  if (isQuoteExpired) return null;

  return (
    <>
      <hr className="my-5" />
      <h2 className="text-center font-bold text-lg">{t("components.RampSummaryCard.BRLOnrampDetails.title")}</h2>
      <p className="pt-2 text-center">{t("components.RampSummaryCard.BRLOnrampDetails.qrCode")}</p>
      <div className="mt-4 mb-4 flex flex-col items-center rounded-lg bg-blue-50 p-4">
        <p className="text-center">
          <Trans key="components.RampSummaryCard.BRLOnrampDetails.qrCodeDescription">
            Once done, please click on <strong>"I have made the payment"</strong>
          </Trans>
        </p>
      </div>
      <div className="my-6 flex justify-center">
        <div className="rounded-lg border-1 border-gray-300 p-4">
          <QRCodeSVG value={rampState.ramp?.depositQrCode} />
        </div>
      </div>
      <p className="text-center">{t("components.RampSummaryCard.BRLOnrampDetails.copyCode")}</p>
      <CopyButton className="mt-4 mb-4 w-full py-10" text={rampState.ramp?.depositQrCode} />
    </>
  );
};
