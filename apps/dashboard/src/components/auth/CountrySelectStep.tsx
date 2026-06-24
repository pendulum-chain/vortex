import { Check } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CORRIDOR_LIST, PROVIDER_LABEL } from "@/domain/corridors";
import type { CorridorId } from "@/domain/types";
import { cn } from "@/lib/cn";

export function CountrySelectStep({
  defaultSelected = [],
  submitLabel = "Continue",
  onSubmit
}: {
  defaultSelected?: CorridorId[];
  submitLabel?: string;
  onSubmit: (corridors: CorridorId[]) => void;
}) {
  const [selected, setSelected] = useState<CorridorId[]>(defaultSelected);

  function toggle(id: CorridorId) {
    setSelected(current => (current.includes(id) ? current.filter(c => c !== id) : [...current, id]));
  }

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Pick the countries you want to transfer to. You can add more later from the dashboard.
      </p>

      <div className="grid gap-2">
        {CORRIDOR_LIST.map(corridor => {
          const isSelected = selected.includes(corridor.id);
          return (
            <button
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                isSelected ? "border-primary bg-primary/5" : "border-input hover:bg-accent"
              )}
              key={corridor.id}
              onClick={() => toggle(corridor.id)}
              type="button"
            >
              <span className="text-2xl">{corridor.flag}</span>
              <div className="grid flex-1 leading-tight">
                <span className="font-medium text-sm">{corridor.name}</span>
                <span className="text-muted-foreground text-xs">
                  {PROVIDER_LABEL[corridor.provider]} · {corridor.currency}
                </span>
              </div>
              {corridor.availability === "coming_soon" ? (
                <Badge variant="secondary">Coming soon</Badge>
              ) : (
                <Badge variant="success">Available</Badge>
              )}
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border",
                  isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input"
                )}
              >
                {isSelected && <Check className="size-3.5" />}
              </span>
            </button>
          );
        })}
      </div>

      <Button className="w-full" disabled={selected.length === 0} onClick={() => onSubmit(selected)}>
        {submitLabel}
      </Button>
    </div>
  );
}
