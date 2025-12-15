import { useSelector } from "@xstate/react";
import { useState } from "react";
import { useRampActor } from "../../../contexts/rampState";
import { cn } from "../../../helpers/cn";
import { useQuote } from "../../../stores/quote/useQuoteStore";
import { QuoteSummary } from "../../QuoteSummary";

export interface AuthEmailStepProps {
  className?: string;
}

export const AuthEmailStep = ({ className }: AuthEmailStepProps) => {
  const rampActor = useRampActor();
  const { errorMessage, userEmail: contextEmail } = useSelector(rampActor, state => ({
    errorMessage: state.context.errorMessage,
    userEmail: state.context.userEmail
  }));

  const quote = useQuote();
  const [email, setEmail] = useState(contextEmail || "");
  const [localError, setLocalError] = useState("");

  const isLoading = useSelector(rampActor, state => state.matches("CheckingEmail") || state.matches("RequestingOTP"));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes("@")) {
      setLocalError("Please enter a valid email address");
      return;
    }

    setLocalError("");
    rampActor.send({ email, type: "ENTER_EMAIL" });
  };

  const [quoteSummaryHeight, setQuoteSummaryHeight] = useState(100);

  return (
    <div
      className={cn("relative flex min-h-[506px] grow flex-col", className)}
      style={{ "--quote-summary-height": `${quoteSummaryHeight}px` } as React.CSSProperties}
    >
      <form className="flex flex-1 flex-col pb-36" onSubmit={handleSubmit}>
        <div className="mt-4 text-center">
          <h1 className="mb-4 font-bold text-3xl text-blue-700">Enter Your Email</h1>
          <p className="mb-6 text-gray-600">We'll send you a one-time code to verify your identity</p>
        </div>

        <div className="flex flex-col items-center">
          <div className="w-full max-w-md space-y-4">
            <div>
              <label className="mb-2 block font-medium text-gray-700 text-sm" htmlFor="email">
                Email Address
              </label>
              <input
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
                id="email"
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
                value={email}
              />
              {(localError || errorMessage) && <p className="mt-2 text-red-600 text-sm">{localError || errorMessage}</p>}
            </div>
          </div>
        </div>

        <div
          className="absolute right-0 left-0 z-[5] mb-4 flex flex-col items-center"
          style={{ bottom: `calc(var(--quote-summary-height, 100px) + 2rem)` }}
        >
          <div className="w-full max-w-md">
            <button
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              disabled={isLoading}
              type="submit"
            >
              {isLoading ? "Sending..." : "Continue"}
            </button>
          </div>
        </div>
      </form>

      {quote && <QuoteSummary onHeightChange={setQuoteSummaryHeight} quote={quote} />}
    </div>
  );
};
