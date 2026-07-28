import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AuthOtpStep } from "@/components/auth/AuthOtpStep";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth.store";

const schema = z.object({ email: z.string().email("Enter a valid email") });
type FormValues = z.infer<typeof schema>;

/**
 * The email → OTP sign-in card, shared by /login and the invite deep link. Verifying the
 * code sets the auth-store user; `onAuthenticated` runs afterwards for explicit navigation.
 */
export function AuthCard({
  title,
  description,
  onAuthenticated
}: {
  title: string;
  description: string;
  onAuthenticated?: () => void;
}) {
  const requestOtp = useAuthStore(state => state.requestOtp);
  const verifyOtp = useAuthStore(state => state.verifyOtp);
  const [email, setEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({ defaultValues: { email: "" }, resolver: standardSchemaResolver(schema) });

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
      onAuthenticated?.();
    } catch (error) {
      toast.error("Verification failed", {
        description: error instanceof Error ? error.message : "Check the code and try again."
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{email ? "Verify your email" : title}</CardTitle>
        <CardDescription>{email ? "Enter the 6-digit code we sent you." : description}</CardDescription>
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
  );
}
