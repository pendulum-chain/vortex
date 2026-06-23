import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { Loader2 } from "lucide-react";
import { AuthOtpStep } from "@/components/auth/AuthOtpStep";
import { CountrySelectStep } from "@/components/auth/CountrySelectStep";
import { RegisterDetailsStep } from "@/components/auth/RegisterDetailsStep";
import { VortexLogo } from "@/components/layout/VortexLogo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CorridorId } from "@/domain/types";
import { type RegisterResult, registerMachine } from "@/machines/register.machine";
import { useAuthStore } from "@/stores/auth.store";
import { useDashboardStore } from "@/stores/dashboard.store";

export const Route = createFileRoute("/register")({
  component: RegisterPage
});

const DEFAULT_COUNTRIES: CorridorId[] = ["BR", "EU"];

function RegisterPage() {
  const navigate = useNavigate();
  const login = useAuthStore(state => state.login);
  const createAccount = useDashboardStore(state => state.createAccount);

  const [state, send] = useMachine(registerMachine, {
    input: {
      onComplete: (result: RegisterResult) => {
        createAccount({
          identifier: result.email,
          name: result.name,
          selectedCorridors: result.selectedCorridors,
          type: result.accountType
        });
        login(result.email);
        navigate({ to: "/overview" });
      }
    }
  });

  const value = String(state.value);
  const isLoading = value === "sendingCode" || value === "verifyingCode";

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <VortexLogo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{titleFor(value)}</CardTitle>
            <CardDescription>{descriptionFor(value)}</CardDescription>
          </CardHeader>
          <CardContent>
            {value === "details" && <RegisterDetailsStep onSubmit={details => send({ details, type: "SUBMIT_DETAILS" })} />}

            {isLoading && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Loader2 className="size-7 animate-spin text-primary" />
                <p className="text-muted-foreground text-sm">
                  {value === "sendingCode" ? "Sending your verification code…" : "Verifying your code…"}
                </p>
              </div>
            )}

            {value === "otp" && (
              <AuthOtpStep
                email={state.context.email}
                onChangeEmail={() => send({ type: "CHANGE_EMAIL" })}
                onVerify={() => send({ type: "VERIFY_OTP" })}
              />
            )}

            {value === "countries" && (
              <CountrySelectStep
                defaultSelected={DEFAULT_COUNTRIES}
                onSubmit={corridors => send({ corridors, type: "SUBMIT_COUNTRIES" })}
              />
            )}
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-muted-foreground text-sm">
          Already have an account?{" "}
          <Link className="text-primary hover:underline" to="/login">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

function titleFor(value: string) {
  switch (value) {
    case "otp":
    case "verifyingCode":
      return "Verify your email";
    case "countries":
      return "Choose your countries";
    default:
      return "Create your account";
  }
}

function descriptionFor(value: string) {
  switch (value) {
    case "otp":
    case "verifyingCode":
      return "Enter the 6-digit code we sent you.";
    case "countries":
      return "Select the corridors you want to onboard.";
    default:
      return "Register to start onboarding and unlock transfers.";
  }
}
