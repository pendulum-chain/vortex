import { useSelector } from "@xstate/react";
import { useEffect, useRef, useState } from "react";
import { useRampActor } from "../../../contexts/rampState";

export interface AuthOTPStepProps {
  className?: string;
}

export const AuthOTPStep = ({ className }: AuthOTPStepProps) => {
  const rampActor = useRampActor();
  const { errorMessage, userEmail } = useSelector(rampActor, state => ({
    errorMessage: state.context.errorMessage,
    userEmail: state.context.userEmail
  }));

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isVerifying = useSelector(rampActor, state => state.matches("VerifyingOTP"));

  const handleChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) {
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (newOtp.every(digit => digit !== "") && index === 5) {
      const code = newOtp.join("");
      rampActor.send({ code, type: "VERIFY_OTP" });
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text");
    const digits = pastedData.match(/\d/g);

    if (digits && digits.length === 6) {
      setOtp(digits);
      inputRefs.current[5]?.focus();
      rampActor.send({ code: digits.join(""), type: "VERIFY_OTP" });
    }
  };

  // Clear OTP on error
  useEffect(() => {
    if (errorMessage) {
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    }
  }, [errorMessage]);

  return (
    <div className={`flex min-h-[506px] grow flex-col ${className || ""}`}>
      <div className="flex flex-col items-center justify-center flex-grow px-6 py-8">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-semibold mb-2 text-center">Enter Verification Code</h2>
          <p className="text-gray-600 mb-6 text-center">
            We sent a 6-digit code to <strong>{userEmail}</strong>
          </p>

          <div className="flex gap-2 justify-center mb-4" onPaste={handlePaste}>
            {otp.map((digit, index) => (
              <input
                autoFocus={index === 0}
                className="w-12 h-14 text-center text-2xl font-semibold border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                disabled={isVerifying}
                inputMode="numeric"
                key={index}
                maxLength={1}
                onChange={e => handleChange(index, e.target.value)}
                onKeyDown={e => handleKeyDown(index, e)}
                ref={el => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                value={digit}
              />
            ))}
          </div>

          {errorMessage && <p className="text-sm text-red-600 text-center mb-4">{errorMessage}</p>}

          {isVerifying && <p className="text-sm text-blue-600 text-center mb-4">Verifying...</p>}

          <button
            className="w-full text-blue-600 hover:text-blue-800 text-sm font-medium underline disabled:text-gray-400 disabled:no-underline"
            disabled={isVerifying}
            onClick={() => rampActor.send({ email: userEmail!, type: "ENTER_EMAIL" })}
          >
            Use a different email
          </button>
        </div>
      </div>
    </div>
  );
};
