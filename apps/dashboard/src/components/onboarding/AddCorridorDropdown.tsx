import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { CORRIDOR_LIST } from "@/domain/corridors";
import type { SenderAccount } from "@/domain/types";
import { useDashboardStore } from "@/stores/dashboard.store";

export function AddCorridorDropdown({ account }: { account: SenderAccount }) {
  const addCorridorToAccount = useDashboardStore(state => state.addCorridorToAccount);
  const available = CORRIDOR_LIST.filter(corridor => !account.selectedCorridors.includes(corridor.id));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={available.length === 0} variant="outline">
          <Plus />
          Add country
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Add a corridor</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {available.map(corridor => (
          <DropdownMenuItem className="gap-2" key={corridor.id} onClick={() => addCorridorToAccount(account.id, corridor.id)}>
            <span className="text-lg">{corridor.flag}</span>
            <span className="flex-1 font-medium text-sm">{corridor.name}</span>
            <span className="text-muted-foreground text-xs">{corridor.currency}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
