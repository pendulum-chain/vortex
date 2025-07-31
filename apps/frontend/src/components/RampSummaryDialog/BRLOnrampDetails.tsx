import { QRCodeSVG } from "qrcode.react";
import { FC, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useRampState } from "../../stores/rampStore";
import { useIsQuoteExpired } from "../../stores/rampSummary";
import { CopyButton } from "../CopyButton";

export const BRLOnrampDetails: FC = () => {
  const { t } = useTranslation();
  const rampState = useRampState();
  const isQuoteExpired = useIsQuoteExpired();
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rampState?.ramp?.depositQrCode && sectionRef.current && !isQuoteExpired) {
      sectionRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [rampState?.ramp?.depositQrCode, isQuoteExpired]);

  if (!rampState?.ramp?.depositQrCode) return null;
  if (isQuoteExpired) return null;

  return (
    <section ref={sectionRef}>
      <hr className="my-5" />
      <h2 className="text-center font-bold text-lg">{t("components.dialogs.RampSummaryDialog.BRLOnrampDetails.title")}</h2>
      <p className="pt-2 text-center">Select PIX in your bank app and scan the QR code below</p>
      <div className="mt-4 mb-4 flex flex-col items-center rounded-lg bg-blue-50 p-4">
        <p className="text-center">
          Once done, please click on <strong>"I have made the payment"</strong>
        </p>
      </div>
      <div className="my-6 flex justify-center">
        <div className="rounded-lg border-1 border-gray-300 p-4">
          <QRCodeSVG value={rampState.ramp?.depositQrCode} />
        </div>
      </div>
      <p className="text-center">or copy the PIX code below and paste it in your bank app</p>
      <CopyButton className="mt-4 mb-4 w-full py-10" text={rampState.ramp?.depositQrCode} />
    </section>
  );
};
