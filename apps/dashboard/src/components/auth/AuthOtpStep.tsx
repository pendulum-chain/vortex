import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

interface AuthOtpStepProps {
  email: string;
  onVerify: (code: string) => void;
  onChangeEmail: () => void;
  onResend: () => Promise<void>;
  submitting?: boolean;
}

export function AuthOtpStep({ email, onVerify, onChangeEmail, onResend, submitting }: AuthOtpStepProps) {
  const [code, setCode] = useState("");

  async function resend() {
    try {
      await onResend();
      toast.success(`A new code was sent to ${email}`);
    } catch (error) {
      toast.error("Could not resend the code", {
        description: error instanceof Error ? error.message : undefined
      });
    }
  }

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

      <Button className="w-full" disabled={code.length < 6 || submitting} onClick={() => onVerify(code)}>
        {submitting ? "Verifying…" : "Verify"}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button className="text-muted-foreground hover:text-foreground" onClick={onChangeEmail} type="button">
          Change email
        </button>
        <button className="text-primary hover:underline" onClick={resend} type="button">
          Resend code
        </button>
      </div>
    </div>
  );
}
