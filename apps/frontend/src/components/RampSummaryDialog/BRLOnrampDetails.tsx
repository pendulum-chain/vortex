import { QRCodeSVG } from "qrcode.react";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useRampDirection } from "../../stores/rampDirectionStore";
import { useRampState } from "../../stores/rampStore";
import { useIsQuoteExpired } from "../../stores/rampSummary";
import { CopyButton } from "../CopyButton";
import { RampDirection } from "../RampToggle";

export const BRLOnrampDetails: FC = () => {
  const { t } = useTranslation();
  const rampDirection = useRampDirection();
  const rampState = useRampState();
  const isQuoteExpired = useIsQuoteExpired();

  if (rampDirection !== RampDirection.ONRAMP) return null;
  if (!rampState?.ramp?.brCode) return null;
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
          <QRCodeSVG value={rampState.ramp?.brCode} />
        </div>
      </div>
      <p className="text-center">{t("components.dialogs.RampSummaryDialog.BRLOnrampDetails.copyCode")}</p>
      <CopyButton text={rampState.ramp?.brCode} className="mt-4 w-full py-10" />
    </section>
  );
};
