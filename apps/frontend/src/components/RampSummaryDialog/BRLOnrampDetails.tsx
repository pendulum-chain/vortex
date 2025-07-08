import { QRCodeSVG } from "qrcode.react";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useRampState } from "../../stores/rampStore";
import { useIsQuoteExpired } from "../../stores/rampSummary";
import { CopyButton } from "../CopyButton";

export const BRLOnrampDetails: FC = () => {
  const { t } = useTranslation();
  const rampState = useRampState();
  const isQuoteExpired = useIsQuoteExpired();

  if (!rampState?.ramp?.depositQrCode) return null;
  if (isQuoteExpired) return null;

  return (
    <section>
      <hr className="my-5" />
      <h1 className="font-bold text-lg">{t("components.dialogs.RampSummaryDialog.BRLOnrampDetails.title")}</h1>
      <h2 className="text-center font-bold text-lg">
        {t("components.dialogs.RampSummaryDialog.BRLOnrampDetails.description")}
      </h2>
      <p className="pt-2 text-center">{t("components.dialogs.RampSummaryDialog.BRLOnrampDetails.qrCode")}</p>
      <div className="my-6 flex justify-center">
        <div className="rounded-lg border-1 border-gray-300 p-4">
          <QRCodeSVG value={rampState.ramp?.depositQrCode} />
        </div>
      </div>
      <p className="text-center">{t("components.dialogs.RampSummaryDialog.BRLOnrampDetails.copyCode")}</p>
      <CopyButton className="mt-4 w-full py-10" text={rampState.ramp?.depositQrCode} />
    </section>
  );
};
