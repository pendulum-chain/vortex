import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

interface AuthOtpStepProps {
  email: string;
  onVerify: (code: string) => void;
  onChangeEmail: () => void;
}

export function AuthOtpStep({ email, onVerify, onChangeEmail }: AuthOtpStepProps) {
  const [code, setCode] = useState("");

  return (
    <div className="grid gap-5">
      <p className="text-muted-foreground text-sm">
        We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>. Enter it below.
      </p>

      <div className="flex justify-center">
        <InputOTP autoFocus inputMode="numeric" maxLength={6} onChange={setCode} onComplete={onVerify} value={code}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>

      <Button className="w-full" disabled={code.length < 6} onClick={() => onVerify(code)}>
        Verify
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button className="text-muted-foreground hover:text-foreground" onClick={onChangeEmail} type="button">
          Change email
        </button>
        <button
          className="text-primary hover:underline"
          onClick={() => toast.success(`A new code was sent to ${email}`)}
          type="button"
        >
          Resend code
        </button>
      </div>

      <p className="text-center text-muted-foreground text-xs">Demo — any 6 digits will verify.</p>
    </div>
  );
}
