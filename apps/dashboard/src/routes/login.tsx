import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AuthOtpStep } from "@/components/auth/AuthOtpStep";
import { VortexLogo } from "@/components/layout/VortexLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth.store";

export const Route = createFileRoute("/login")({
  component: LoginPage
});

const schema = z.object({ email: z.string().email("Enter a valid email") });
type FormValues = z.infer<typeof schema>;

function LoginPage() {
  const user = useAuthStore(state => state.user);
  const requestOtp = useAuthStore(state => state.requestOtp);
  const verifyOtp = useAuthStore(state => state.verifyOtp);
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({ defaultValues: { email: "" }, resolver: zodResolver(schema) });

  if (user) {
    return <Navigate to="/overview" />;
  }

  async function submitEmail(values: FormValues) {
    setSubmitting(true);
    try {
      await requestOtp(values.email);
      setEmail(values.email);
    } catch (error) {
      toast.error("Could not send the code", {
        description: error instanceof Error ? error.message : undefined
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitOtp(code: string) {
    if (!email || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await verifyOtp(email, code);
      navigate({ to: "/overview" });
    } catch (error) {
      toast.error("Verification failed", {
        description: error instanceof Error ? error.message : "Check the code and try again."
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <VortexLogo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{email ? "Verify your email" : "Connect with Vortex"}</CardTitle>
            <CardDescription>
              {email ? "Enter the 6-digit code we sent you." : "Enter your email — we'll sign you in or create your account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {email ? (
              <AuthOtpStep
                email={email}
                onChangeEmail={() => setEmail(null)}
                onResend={() => requestOtp(email)}
                onVerify={submitOtp}
                submitting={submitting}
              />
            ) : (
              <Form {...form}>
                <form className="grid gap-4" onSubmit={form.handleSubmit(submitEmail)}>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input autoComplete="email" placeholder="you@company.com" type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button className="w-full" disabled={submitting} type="submit">
                    {submitting ? "Sending code…" : "Continue"}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
