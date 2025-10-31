import { useSelector } from "@xstate/react";
import { useState } from "react";
import { useRampActor } from "../../../contexts/rampState";

export interface AuthEmailStepProps {
  className?: string;
}

export const AuthEmailStep = ({ className }: AuthEmailStepProps) => {
  const rampActor = useRampActor();
  const { errorMessage, userEmail: contextEmail } = useSelector(rampActor, state => ({
    errorMessage: state.context.errorMessage,
    userEmail: state.context.userEmail
  }));

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

  return (
    <div className={`flex min-h-[506px] grow flex-col ${className || ""}`}>
      <div className="flex flex-col items-center justify-center flex-grow px-6 py-8">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-semibold mb-2 text-center">Enter Your Email</h2>
          <p className="text-gray-600 mb-6 text-center">We'll send you a one-time code to verify your identity</p>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="email">
                Email Address
              </label>
              <input
                autoFocus
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
                id="email"
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
                value={email}
              />
              {(localError || errorMessage) && <p className="mt-2 text-sm text-red-600">{localError || errorMessage}</p>}
            </div>

            <button
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              disabled={isLoading}
              type="submit"
            >
              {isLoading ? "Sending..." : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
