import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { CorridorCard } from "@/components/onboarding/CorridorCard";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CORRIDORS, isCorridorAvailableForAccountType } from "@/domain/corridors";
import { type CorridorId, corridorIdSchema } from "@/domain/types";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { spring } from "@/lib/motion";

export const Route = createFileRoute("/_app/overview")({
  component: OverviewPage,
  // Any corridor, so the quote page can deep-link a sender straight into the onboarding they lack.
  validateSearch: z.object({ onboarding: corridorIdSchema.optional() })
});

function OverviewPage() {
  const account = useActiveAccount();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [activeCorridor, setActiveCorridor] = useState<CorridorId | null>(null);
  const [addedCorridors, setAddedCorridors] = useState<CorridorId[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<CorridorId | "">("");

  if (!account) {
    return null;
  }

  const visibleCorridorIds = Array.from(new Set([...account.selectedCorridors, ...addedCorridors]));
  const corridors = visibleCorridorIds.map(id => CORRIDORS[id]);
  const availableToAdd = Object.values(CORRIDORS).filter(
    corridor => !visibleCorridorIds.includes(corridor.id) && isCorridorAvailableForAccountType(corridor.id, account.type)
  );
  const approved = corridors.filter(corridor => account.onboardings[corridor.id]?.status === "approved").length;
  const openCorridor = activeCorridor ?? search.onboarding ?? null;

  function addCorridor() {
    if (!selectedToAdd) {
      return;
    }
    setAddedCorridors(current => (current.includes(selectedToAdd) ? current : [...current, selectedToAdd]));
    setSelectedToAdd("");
    setIsAddOpen(false);
  }

  function closeOnboarding() {
    setActiveCorridor(null);
    if (search.onboarding) {
      navigate({ replace: true, search: {}, to: "/overview" });
    }
  }

  return (
    <Stagger className="mx-auto grid max-w-5xl gap-6">
      <StaggerItem>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-balance font-semibold text-2xl tracking-tight">Onboarding</h1>
            <p className="text-muted-foreground">
              Complete KYB/KYC for {account.name} to unlock transfers — {approved} of {corridors.length} corridor
              {corridors.length === 1 ? "" : "s"} approved.
            </p>
          </div>
          <Button disabled={availableToAdd.length === 0} onClick={() => setIsAddOpen(true)}>
            <Plus />
            Add corridor
          </Button>
        </div>
      </StaggerItem>

      {corridors.length > 0 ? (
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
      ) : (
        <StaggerItem className="rounded-lg border border-dashed p-8 text-center">
          <p className="font-medium">No corridors added yet</p>
          <p className="text-muted-foreground text-sm">Add only the corridors you want to onboard for.</p>
        </StaggerItem>
      )}

      <Dialog onOpenChange={setIsAddOpen} open={isAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add corridor</DialogTitle>
            <DialogDescription>Select the corridor you want to track and onboard for.</DialogDescription>
          </DialogHeader>
          <Select onValueChange={value => setSelectedToAdd(value as CorridorId)} value={selectedToAdd}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a corridor" />
            </SelectTrigger>
            <SelectContent>
              {availableToAdd.map(corridor => (
                <SelectItem key={corridor.id} value={corridor.id}>
                  {corridor.flag} {corridor.name} · {corridor.currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button onClick={() => setIsAddOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={!selectedToAdd} onClick={addCorridor} type="button">
              Add card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {openCorridor && (
        <OnboardingWizard
          account={account}
          corridor={CORRIDORS[openCorridor]}
          key={`${account.id}-${openCorridor}`}
          onClose={closeOnboarding}
        />
      )}
    </Stagger>
  );
}
