import { useSelector } from "@xstate/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as yup from "yup";
import { useRampActor } from "../../../contexts/rampState";
import { cn } from "../../../helpers/cn";
import { useQuote } from "../../../stores/quote/useQuoteStore";
import { QuoteSummary } from "../../QuoteSummary";

const emailSchema = yup.string().email().required();

export interface AuthEmailStepProps {
  className?: string;
}

export const AuthEmailStep = ({ className }: AuthEmailStepProps) => {
  const { t, i18n } = useTranslation();
  const rampActor = useRampActor();
  const { errorMessage, userEmail: contextEmail } = useSelector(rampActor, state => ({
    errorMessage: state.context.errorMessage,
    userEmail: state.context.userEmail
  }));

  const quote = useQuote();
  const [email, setEmail] = useState(contextEmail || "");
  const [localError, setLocalError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const isLoading = useSelector(rampActor, state => state.matches("CheckingEmail") || state.matches("RequestingOTP"));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedEmail = email.trim();
    if (!emailSchema.isValidSync(trimmedEmail)) {
      setLocalError(t("components.authEmailStep.validation.invalidEmail"));
      return;
    }

    setLocalError("");
    rampActor.send({ email: trimmedEmail, type: "ENTER_EMAIL" });
  };

  return (
    <div className={cn("relative flex min-h-[506px] grow flex-col", className)}>
      <form className="flex flex-1 flex-col pb-36" onSubmit={handleSubmit}>
        <div className="mt-4 text-center">
          <h1 className="mb-4 font-bold text-3xl text-blue-700">{t("components.authEmailStep.title")}</h1>
          <p className="mb-6 text-gray-600">{t("components.authEmailStep.description")}</p>
        </div>

        <div className="flex flex-col items-center">
          <div className="w-full max-w-md space-y-4">
            <div>
              <label className="mb-1 block" htmlFor="email">
                {t("components.authEmailStep.fields.email.label")}
              </label>
              <input
                aria-describedby={localError || errorMessage ? "email-error" : undefined}
                aria-invalid={!!(localError || errorMessage)}
                autoFocus
                className={cn(
                  "input-vortex-primary input-ghost w-full rounded-lg border-1 border-neutral-300 p-2",
                  (localError || errorMessage) && "border-red-800"
                )}
                disabled={isLoading}
                id="email"
                onChange={e => setEmail(e.target.value)}
                placeholder={t("components.authEmailStep.fields.email.placeholder")}
                type="email"
                value={email}
              />
              {(localError || errorMessage) && (
                <span className="mt-1 block text-red-800 text-sm" id="email-error">
                  {localError || errorMessage}
                </span>
              )}
            </div>

            <div className="flex items-start gap-3">
              <input
                checked={termsAccepted}
                className="checkbox checkbox-primary checkbox-sm mt-0.5 rounded-sm p-1"
                disabled={isLoading}
                id="terms"
                onChange={e => setTermsAccepted(e.target.checked)}
                type="checkbox"
              />
              <label className="cursor-pointer text-gray-600 text-sm" htmlFor="terms">
                {t("components.authEmailStep.termsCheckbox.prefix")}{" "}
                <a
                  className="text-blue-600 underline hover:text-blue-700"
                  href={`/${i18n.language}/terms-and-conditions`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {t("components.authEmailStep.termsCheckbox.termsAndConditions")}
                </a>{" "}
                {t("components.authEmailStep.termsCheckbox.and")}{" "}
                <a
                  className="text-blue-600 underline hover:text-blue-700"
                  href={`/${i18n.language}/privacy-policy`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {t("components.authEmailStep.termsCheckbox.privacyPolicy")}
                </a>
              </label>
            </div>
          </div>
        </div>

        <div className="absolute right-0 bottom-above-quote left-0 z-[5] mb-4 flex flex-col items-center">
          <div className="w-full max-w-md">
            <button className="btn-vortex-primary btn w-full" disabled={isLoading || !termsAccepted} type="submit">
              {isLoading ? t("components.authEmailStep.buttons.sending") : t("components.authEmailStep.buttons.continue")}
            </button>
          </div>
        </div>
      </form>

      {quote && <QuoteSummary quote={quote} />}
    </div>
  );
};
