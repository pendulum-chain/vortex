import { useSelector } from "@xstate/react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { cn } from "../../../helpers/cn";
import { useQuote } from "../../../stores/quote/useQuoteStore";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../../InputOTP";
import { QuoteSummary } from "../../QuoteSummary";

export interface AuthOTPStepProps {
  className?: string;
}

export function AuthOTPStep({ className }: AuthOTPStepProps) {
  const rampActor = useRampActor();
  const { t } = useTranslation();
  const { errorMessage, userEmail, isVerifying } = useSelector(rampActor, state => ({
    errorMessage: state.context.errorMessage,
    isVerifying: state.matches("VerifyingOTP"),
    userEmail: state.context.userEmail
  }));

  const quote = useQuote();
  const [otp, setOtp] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(value: string) {
    setOtp(value);
    if (value.length === 6) {
      rampActor.send({ code: value, type: "VERIFY_OTP" });
    }
  }

  useEffect(() => {
    if (errorMessage) {
      setOtp("");
      inputRef.current?.focus();
    }
  }, [errorMessage]);

  const [quoteSummaryHeight, setQuoteSummaryHeight] = useState(100);

  return (
    <div
      className={cn("relative flex min-h-[506px] grow flex-col", className)}
      style={{ "--quote-summary-height": `${quoteSummaryHeight}px` } as React.CSSProperties}
    >
      <div className="flex-1 pb-36">
        <div className="mt-4 text-center">
          <h1 className="mb-4 font-bold text-3xl text-blue-700">{t("components.authOTPStep.title")}</h1>
          <p className="mb-6 text-gray-600">
            <Trans i18nKey="components.authOTPStep.description" values={{ email: userEmail }}>
              We sent a 6-digit code to <strong>{userEmail}</strong>
            </Trans>
          </p>
        </div>

        <div className="flex flex-col items-center px-6">
          <div className="w-full max-w-md">
            <div className="mb-4 flex justify-center">
              <InputOTP
                autoFocus
                disabled={isVerifying}
                maxLength={6}
                onChange={handleChange}
                pattern={REGEXP_ONLY_DIGITS}
                ref={inputRef}
                value={otp}
              >
                <InputOTPGroup className="gap-2">
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <span className="mx-2 text-gray-400">-</span>
                <InputOTPGroup className="gap-2">
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            {errorMessage && <p className="mb-4 text-center text-red-600 text-sm">{errorMessage}</p>}

            {isVerifying && (
              <p className="mb-4 text-center text-blue-600 text-sm">{t("components.authOTPStep.status.verifying")}</p>
            )}

            <button
              className="w-full font-medium text-blue-600 text-sm underline hover:text-blue-800 disabled:text-gray-400 disabled:no-underline"
              disabled={isVerifying}
              onClick={() => rampActor.send({ type: "CHANGE_EMAIL" })}
              type="button"
            >
              {t("components.authOTPStep.buttons.useDifferentEmail")}
            </button>
          </div>
        </div>
      </div>

      {quote && <QuoteSummary onHeightChange={setQuoteSummaryHeight} quote={quote} />}
    </div>
  );
}
