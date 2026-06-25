import { createFileRoute } from "@tanstack/react-router";
import { Building2, Globe, User } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { CountrySelectStep } from "@/components/auth/CountrySelectStep";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { AddCorridorDropdown } from "@/components/onboarding/AddCorridorDropdown";
import { CorridorCard } from "@/components/onboarding/CorridorCard";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CORRIDORS } from "@/domain/corridors";
import type { AccountType, CorridorId, SenderAccount } from "@/domain/types";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { popIn, spring } from "@/lib/motion";
import { useDashboardStore } from "@/stores/dashboard.store";

export const Route = createFileRoute("/_app/overview")({
  component: OverviewPage
});

function OverviewPage() {
  const account = useActiveAccount();
  const [activeCorridor, setActiveCorridor] = useState<CorridorId | null>(null);

  if (!account) {
    return null;
  }

  if (account.selectedCorridors.length === 0) {
    return <ChooseCountriesCta account={account} />;
  }

  const corridors = account.selectedCorridors.map(id => CORRIDORS[id]);
  const approved = corridors.filter(c => account.onboardings[c.id]?.status === "approved").length;

  return (
    <Stagger className="mx-auto grid max-w-5xl gap-6">
      <StaggerItem className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-balance font-semibold text-2xl tracking-tight">Onboarding</h1>
          <p className="text-muted-foreground">
            Complete KYB/KYC for {account.name} to unlock transfers — {approved} of {corridors.length} corridor
            {corridors.length === 1 ? "" : "s"} approved.
          </p>
        </div>
        <AddCorridorDropdown account={account} />
      </StaggerItem>

      <Stagger className="grid gap-4 md:grid-cols-2">
        {corridors.map(corridor => (
          <StaggerItem
            className="h-full"
            key={corridor.id}
            transition={spring}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.99 }}
          >
            <CorridorCard account={account} corridor={corridor} onStart={() => setActiveCorridor(corridor.id)} />
          </StaggerItem>
        ))}
      </Stagger>

      {activeCorridor && (
        <OnboardingWizard
          account={account}
          corridor={CORRIDORS[activeCorridor]}
          key={`${account.id}-${activeCorridor}`}
          onClose={() => setActiveCorridor(null)}
        />
      )}
    </Stagger>
  );
}

function ChooseCountriesCta({ account }: { account: SenderAccount }) {
  const addCorridorToAccount = useDashboardStore(state => state.addCorridorToAccount);
  const setAccountType = useDashboardStore(state => state.setAccountType);
  const [type, setType] = useState<AccountType>(account.type);

  return (
    <Stagger className="mx-auto grid max-w-xl gap-6">
      <StaggerItem className="text-center">
        <motion.span
          animate="show"
          className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
          initial="hidden"
          variants={popIn}
        >
          <Globe className="size-6" />
        </motion.span>
        <h1 className="text-balance font-semibold text-2xl tracking-tight">Welcome to Vortex</h1>
        <p className="text-pretty text-muted-foreground">
          Tell us who you are and choose the countries you operate in to start your KYB/KYC onboarding.
        </p>
      </StaggerItem>
      <StaggerItem>
        <Card>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <p className="font-medium text-sm">I'm onboarding as</p>
              <Tabs onValueChange={value => setType(value as AccountType)} value={type}>
                <TabsList className="w-full">
                  <TabsTrigger value="individual">
                    <User />
                    Individual
                  </TabsTrigger>
                  <TabsTrigger value="company">
                    <Building2 />
                    Company
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <CountrySelectStep
              onSubmit={corridors => {
                setAccountType(account.id, type);
                for (const id of corridors) {
                  addCorridorToAccount(account.id, id);
                }
              }}
              submitLabel="Start onboarding"
            />
          </CardContent>
        </Card>
      </StaggerItem>
    </Stagger>
  );
}
