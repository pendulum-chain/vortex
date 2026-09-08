import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CHILD_CREDENTIAL_WARNING } from "@/domain/api-credentials";
import { MANAGED_PROFILES_QUERY_KEY } from "@/hooks/useManagedProfiles";
import { ORGANIZATION_QUERY_KEY } from "@/hooks/useOrganization";
import { isApiError } from "@/services/api/api-client";
import {
  type MemberInvitation,
  type Organization,
  OrganizationService as service,
  shouldRetryMembershipQuery,
  type TeamMember
} from "@/services/api/managed-profile-memberships.service";
import { useAuthStore } from "@/stores/auth.store";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email"),
  role: z.enum(["manager", "read_only"])
});
type InviteValues = z.infer<typeof inviteSchema>;
type Action =
  | { type: "invite" }
  | { type: "cancel"; invitation: MemberInvitation }
  | { type: "change" | "remove"; member: TeamMember };
const ROLE_LABEL = { manager: "Manager", read_only: "Read only" };
const EVENT_LABEL = {
  invitation_accepted: "Invitation accepted",
  invitation_cancelled: "Invitation cancelled",
  invitation_expired: "Invitation expired",
  invited: "Invitation sent",
  member_added: "Member added",
  member_removed: "Member removed",
  role_changed: "Role changed"
};

export function Team({
  actorId,
  organization,
  authorityPending
}: {
  actorId: string;
  organization: Organization;
  authorityPending: boolean;
}) {
  const client = useQueryClient();
  const actorEmail = useAuthStore(state => state.user?.email)
    ?.trim()
    .toLowerCase();
  const [memberOffset, setMemberOffset] = useState(0);
  const [invitationOffset, setInvitationOffset] = useState(0);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [action, setAction] = useState<Action | null>(null);
  const queryKey = ["organization-team", actorId, organization.ownerProfileId];
  const members = useQuery({
    queryFn: ({ signal }) => service.members(organization.ownerProfileId, memberOffset, signal),
    queryKey: [...queryKey, "members", memberOffset],
    refetchOnWindowFocus: "always",
    retry: shouldRetryMembershipQuery
  });
  const invitations = useQuery({
    queryFn: ({ signal }) => service.invitations(organization.ownerProfileId, invitationOffset, signal),
    queryKey: [...queryKey, "invitations", invitationOffset],
    refetchOnWindowFocus: "always",
    retry: shouldRetryMembershipQuery
  });
  const visibleInvitations = (invitations.data?.invitations ?? []).filter(
    invitation => !actorEmail || invitation.status !== "accepted" || invitation.email.trim().toLowerCase() !== actorEmail
  );
  const cursor = cursors.at(-1);
  const events = useQuery({
    queryFn: ({ signal }) => service.events(organization.ownerProfileId, cursor, signal),
    queryKey: [...queryKey, "events", cursor],
    refetchOnWindowFocus: "always",
    retry: shouldRetryMembershipQuery
  });
  const failed = members.isError || invitations.isError || events.isError;
  const canManage = organization.membership.role === "manager" && !failed;

  useEffect(() => {
    if (members.error || invitations.error || events.error) {
      void client.invalidateQueries({ queryKey: [ORGANIZATION_QUERY_KEY, actorId] });
    }
  }, [client, actorId, members.error, invitations.error, events.error]);

  useEffect(() => {
    if (!canManage) setAction(null);
  }, [canManage]);

  async function refreshTeam() {
    await Promise.all([
      client.invalidateQueries({ queryKey }),
      client.invalidateQueries({ queryKey: [ORGANIZATION_QUERY_KEY, actorId] }),
      client.invalidateQueries({ queryKey: [MANAGED_PROFILES_QUERY_KEY] }),
      client.invalidateQueries({ queryKey: ["managed-profile-bootstrap"] })
    ]);
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-semibold text-2xl tracking-tight">Team</h1>
          <p className="break-all text-muted-foreground">
            Organization: {organization.ownerEmail ?? organization.ownerProfileId}
          </p>
          <p className="text-muted-foreground">
            Team access covers all current and future managed profiles. Personal account resources stay private.
          </p>
        </div>
        {canManage && (
          <Button disabled={authorityPending} onClick={() => setAction({ type: "invite" })}>
            Invite member
          </Button>
        )}
      </div>
      {organization.membership.role === "read_only" && (
        <p className="text-muted-foreground text-sm">Team access is read-only for this membership.</p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {members.isPending ? (
            <Skeleton className="h-32" />
          ) : members.isError ? (
            <div role="alert">
              <p>Could not load members.</p>
              <Button onClick={() => members.refetch()} variant="outline">
                Retry members
              </Button>
            </div>
          ) : (
            <>
              <ul className="divide-y">
                {members.data.members.map(member => (
                  <li className="flex flex-wrap items-center justify-between gap-3 py-4" key={member.id}>
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="break-all font-medium">{member.email ?? member.memberProfileId}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant="secondary">{ROLE_LABEL[member.role]}</Badge>
                        {member.isOwner && <Badge variant="outline">Owner</Badge>}
                        {member.memberProfileId === actorId && <Badge variant="outline">You</Badge>}
                      </div>
                      {member.isOwner && (
                        <p className="mt-1 text-muted-foreground text-xs">Owner access cannot be changed or removed.</p>
                      )}
                    </div>
                    {canManage && !member.isOwner && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={authorityPending}
                          onClick={() => setAction({ member, type: "change" })}
                          size="sm"
                          variant="outline"
                        >
                          Change role
                        </Button>
                        <Button
                          disabled={authorityPending}
                          onClick={() => setAction({ member, type: "remove" })}
                          size="sm"
                          variant="outline"
                        >
                          Remove member
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {members.data.members.length === 0 && <p className="py-4 text-muted-foreground">No members on this page.</p>}
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  disabled={memberOffset === 0 || members.isFetching}
                  onClick={() => setMemberOffset(Math.max(0, memberOffset - 20))}
                  size="sm"
                  variant="outline"
                >
                  Previous members
                </Button>
                <Button
                  disabled={members.isFetching || memberOffset + members.data.pagination.limit >= members.data.pagination.total}
                  onClick={() => setMemberOffset(memberOffset + 20)}
                  size="sm"
                  variant="outline"
                >
                  Next members
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.isPending ? (
            <Skeleton className="h-32" />
          ) : invitations.isError ? (
            <div role="alert">
              <p>Could not load invitations.</p>
              <Button onClick={() => invitations.refetch()} variant="outline">
                Retry invitations
              </Button>
            </div>
          ) : (
            <>
              <ul className="divide-y">
                {visibleInvitations.map(invitation => (
                  <li className="flex flex-wrap items-center justify-between gap-3 py-4" key={invitation.id}>
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="break-all font-medium">{invitation.email}</p>
                      <div className="my-1 flex flex-wrap gap-2">
                        <Badge variant="secondary">{ROLE_LABEL[invitation.role]}</Badge>
                        <Badge className="capitalize" variant="outline">
                          {invitation.status}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-xs">Expires {new Date(invitation.expiresAt).toLocaleString()}</p>
                    </div>
                    {canManage && invitation.status === "pending" && (
                      <Button
                        disabled={authorityPending}
                        onClick={() => setAction({ invitation, type: "cancel" })}
                        size="sm"
                        variant="outline"
                      >
                        Cancel invitation
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {visibleInvitations.length === 0 && <p className="py-4 text-muted-foreground">No invitations on this page.</p>}
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  disabled={invitationOffset === 0 || invitations.isFetching}
                  onClick={() => setInvitationOffset(Math.max(0, invitationOffset - 20))}
                  size="sm"
                  variant="outline"
                >
                  Previous invitations
                </Button>
                <Button
                  disabled={
                    invitations.isFetching ||
                    invitationOffset + invitations.data.pagination.limit >= invitations.data.pagination.total
                  }
                  onClick={() => setInvitationOffset(invitationOffset + 20)}
                  size="sm"
                  variant="outline"
                >
                  Next invitations
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Access history</CardTitle>
        </CardHeader>
        <CardContent>
          {events.isPending ? (
            <Skeleton className="h-32" />
          ) : events.isError ? (
            <div role="alert">
              <p>Could not load access history.</p>
              <Button onClick={() => events.refetch()} variant="outline">
                Retry history
              </Button>
            </div>
          ) : (
            <>
              <ul className="divide-y">
                {events.data.events.map(event => (
                  <li className="grid gap-1 py-4 text-sm" key={event.id}>
                    <p className="font-medium">{EVENT_LABEL[event.action]}</p>
                    <p className="text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()}
                      {event.role &&
                        ` - ${event.previousRole ? `${ROLE_LABEL[event.previousRole]} to ` : ""}${ROLE_LABEL[event.role]}`}
                    </p>
                    <p className="break-all text-muted-foreground text-xs">
                      Actor: {event.actorProfileId ?? "System"}
                      {event.memberProfileId && ` - Member: ${event.memberProfileId}`}
                    </p>
                  </li>
                ))}
              </ul>
              {events.data.events.length === 0 && <p className="py-4 text-muted-foreground">No access events yet.</p>}
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  disabled={cursors.length === 1 || events.isFetching}
                  onClick={() => setCursors(value => value.slice(0, -1))}
                  size="sm"
                  variant="outline"
                >
                  Newer events
                </Button>
                <Button
                  disabled={!events.data.pagination.nextCursor || events.isFetching}
                  onClick={() => setCursors(value => [...value, events.data.pagination.nextCursor ?? undefined])}
                  size="sm"
                  variant="outline"
                >
                  Older events
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {canManage && action && (
        <TeamActionDialog
          action={action}
          authorityPending={authorityPending}
          expectedOwnerProfileId={organization.ownerProfileId}
          onClose={() => setAction(null)}
          refreshTeam={refreshTeam}
        />
      )}
    </div>
  );
}

function TeamActionDialog({
  action,
  authorityPending,
  expectedOwnerProfileId,
  onClose,
  refreshTeam
}: {
  action: Action;
  authorityPending: boolean;
  expectedOwnerProfileId: string;
  onClose: () => void;
  refreshTeam: () => Promise<void>;
}) {
  const form = useForm<InviteValues>({
    defaultValues: { email: "", role: "read_only" },
    resolver: standardSchemaResolver(inviteSchema)
  });
  const nextRole = "member" in action && action.member.role === "manager" ? "read_only" : "manager";
  const title = { cancel: "Cancel invitation", change: "Change role", invite: "Invite member", remove: "Remove member" }[
    action.type
  ];
  const mutation = useMutation({
    mutationFn: async (values: InviteValues) => {
      if (authorityPending) throw new Error("Organization access is being refreshed. Try again.");
      switch (action.type) {
        case "invite":
          await service.invite(expectedOwnerProfileId, values);
          break;
        case "cancel":
          await service.cancel(expectedOwnerProfileId, action.invitation.id);
          break;
        case "change":
          if (!action.member.isOwner) await service.changeRole(expectedOwnerProfileId, action.member.memberProfileId, nextRole);
          break;
        case "remove":
          if (!action.member.isOwner) await service.remove(expectedOwnerProfileId, action.member.memberProfileId);
          break;
      }
    },
    onError: error => {
      if (isApiError(error) && error.data.code === "ORGANIZATION_CONTEXT_CHANGED") {
        toast.error("Your organization changed. The action was not applied. Review your current team before trying again.");
        onClose();
      }
    },
    onSettled: refreshTeam,
    onSuccess: () => {
      toast.success("Team updated");
      onClose();
    }
  });
  return (
    <Dialog onOpenChange={open => !open && !mutation.isPending && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="break-words">
            {action.type === "invite"
              ? "Invite a member to all current and future managed profiles in this organization. Access is granted only after the recipient explicitly accepts with their verified email. Each person can belong to only one organization."
              : action.type === "cancel"
                ? `Cancel the pending invitation for ${action.invitation.email}? It will no longer be usable.`
                : action.type === "change"
                  ? `Change ${action.member.email ?? action.member.memberProfileId} to ${ROLE_LABEL[nextRole]} across all current and future managed profiles?`
                  : `Remove ${action.member.email ?? action.member.memberProfileId} from this organization and all its managed profiles?`}
          </DialogDescription>
        </DialogHeader>
        {(action.type === "remove" || (action.type === "change" && nextRole === "read_only")) && (
          <p className="text-sm">{CHILD_CREDENTIAL_WARNING}</p>
        )}
        {(action.type === "invite" || (action.type === "change" && nextRole === "manager")) && (
          <p className="text-muted-foreground text-sm">
            Managers can administer non-owner team access and child credentials. Read-only members can view data but cannot make
            changes. Only the owner can provision or delete profiles. Personal account resources are not shared.
          </p>
        )}
        {mutation.isError && (
          <p className="text-destructive text-sm" role="alert">
            {isApiError(mutation.error) ? mutation.error.message : "Could not update the team. Try again."}
          </p>
        )}
        {action.type === "invite" && (
          <Form {...form}>
            <form className="grid gap-4" id="team-invite-form" onSubmit={form.handleSubmit(values => mutation.mutate(values))}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input autoComplete="email" type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="read_only">Read only</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        )}
        <DialogFooter>
          <Button disabled={mutation.isPending} onClick={onClose} type="button" variant="ghost">
            Back
          </Button>
          <Button
            disabled={mutation.isPending || authorityPending}
            form={action.type === "invite" ? "team-invite-form" : undefined}
            onClick={action.type === "invite" ? undefined : () => mutation.mutate(form.getValues())}
            type={action.type === "invite" ? "submit" : "button"}
            variant={action.type === "remove" ? "destructive" : "default"}
          >
            {mutation.isPending ? "Updating..." : action.type === "invite" ? "Send invitation" : title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
