import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ONBOARDING_STATUS_QUERY_KEY } from "@/hooks/useApprovedCorridors";
import { cn } from "@/lib/cn";
import { type ActiveEntityType, OnboardingService } from "@/services/api/onboarding.service";

const OPTIONS = [
  {
    description: "Verify your personal identity and send as yourself.",
    icon: UserRound,
    label: "Individual",
    type: "individual"
  },
  {
    description: "Verify a legal entity and send on behalf of your company.",
    icon: Building2,
    label: "Company",
    type: "business"
  }
] as const;

export function AccountTypeSelector() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (type: ActiveEntityType) => OnboardingService.selectActiveEntity(type),
    onError: error => {
      toast.error("Could not select an account type", {
        description: error instanceof Error ? error.message : undefined
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ONBOARDING_STATUS_QUERY_KEY })
  });

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center">
      <div className="w-full space-y-8">
        <div className="space-y-2 text-center">
          <p className="font-medium text-primary text-sm uppercase tracking-[0.18em]">Set up your sender profile</p>
          <h1 className="text-balance font-semibold text-3xl tracking-tight md:text-4xl">How will you use Vortex?</h1>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Choose the legal identity for this account. This selection cannot be changed later.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {OPTIONS.map(option => {
            const Icon = option.icon;
            const isPending = mutation.isPending && mutation.variables === option.type;
            return (
              <Card className="group border border-border/70 transition-colors hover:border-primary/50" key={option.type}>
                <CardHeader>
                  <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <CardTitle className="text-xl">{option.label}</CardTitle>
                  <CardDescription className="min-h-10">{option.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    className={cn("w-full", isPending && "animate-pulse")}
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate(option.type)}
                  >
                    {isPending ? "Selecting..." : `Continue as ${option.label.toLowerCase()}`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
