import { MoreHorizontal, UsersRound } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CORRIDORS } from "@/domain/corridors";
import type { CorridorId } from "@/domain/types";
import type { ManagedProfile } from "@/services/api/managed-profiles.service";
import { ActForManagedProfileDialog } from "./ActForManagedProfileDialog";

function Actions({ onAct, profile }: { onAct: (profile: ManagedProfile) => void; profile: ManagedProfile }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={`Actions for ${profile.contactEmail ?? profile.externalSubjectId}`} size="icon" variant="ghost">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onAct(profile)}>Act for this profile</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CorridorBadges({ corridors }: { corridors: CorridorId[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {corridors.map(id => (
        <Badge key={id} variant="outline">
          {CORRIDORS[id].flag} {CORRIDORS[id].name}
        </Badge>
      ))}
    </div>
  );
}

export function ManagedProfilesList({ profiles, corridors }: { profiles: ManagedProfile[]; corridors: CorridorId[] }) {
  const [target, setTarget] = useState<ManagedProfile | null>(null);

  if (profiles.length === 0) {
    return (
      <div className="grid justify-items-center gap-2 py-12 text-center">
        <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <UsersRound className="size-5" />
        </span>
        <p className="font-medium">No managed profiles</p>
        <p className="text-muted-foreground text-sm">Active profiles will appear here when they are assigned to you.</p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead>External subject ID</TableHead>
              <TableHead>Customer type</TableHead>
              <TableHead>Authorized corridors</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map(profile => (
              <TableRow key={profile.profileId}>
                <TableCell className="font-medium">{profile.contactEmail ?? "Not provided"}</TableCell>
                <TableCell className="max-w-64 truncate font-mono text-xs">{profile.externalSubjectId}</TableCell>
                <TableCell className="capitalize">{profile.customerType}</TableCell>
                <TableCell>
                  <CorridorBadges corridors={corridors} />
                </TableCell>
                <TableCell className="text-right">
                  <Actions onAct={setTarget} profile={profile} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="grid gap-3 md:hidden">
        {profiles.map(profile => (
          <Card key={profile.profileId}>
            <CardContent className="grid gap-4 p-4">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{profile.contactEmail ?? "No contact email"}</p>
                  <p className="break-all font-mono text-muted-foreground text-xs">{profile.externalSubjectId}</p>
                </div>
                <Actions onAct={setTarget} profile={profile} />
              </div>
              <div className="grid gap-2">
                <Badge className="w-fit capitalize" variant="secondary">
                  {profile.customerType}
                </Badge>
                <CorridorBadges corridors={corridors} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <ActForManagedProfileDialog onOpenChange={open => !open && setTarget(null)} profile={target} />
    </>
  );
}
