import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthOtpStep } from "@/components/auth/AuthOtpStep";
import { VortexLogo } from "@/components/layout/VortexLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth.store";
import { useDashboardStore } from "@/stores/dashboard.store";

export const Route = createFileRoute("/login")({
  component: LoginPage
});

const schema = z.object({ email: z.string().email("Enter a valid email") });
type FormValues = z.infer<typeof schema>;

function LoginPage() {
  const user = useAuthStore(state => state.user);
  const login = useAuthStore(state => state.login);
  const signInWithEmail = useDashboardStore(state => state.signInWithEmail);
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);

  const form = useForm<FormValues>({ defaultValues: { email: "" }, resolver: zodResolver(schema) });

  if (user) {
    return <Navigate to="/overview" />;
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
                onVerify={() => {
                  signInWithEmail(email);
                  login(email);
                  navigate({ to: "/overview" });
                }}
              />
            ) : (
              <Form {...form}>
                <form className="grid gap-4" onSubmit={form.handleSubmit(values => setEmail(values.email))}>
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
                  <Button className="w-full" type="submit">
                    Continue
                  </Button>
                  <p className="text-center text-muted-foreground text-xs">Demo environment — any email works.</p>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
