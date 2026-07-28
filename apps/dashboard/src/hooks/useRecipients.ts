import { useQuery } from "@tanstack/react-query";
import type { AlfredpayListFiatAccountsResponse } from "@vortexfi/shared";
import { useMemo } from "react";
import type { CorridorId, Recipient, SenderAccount } from "@/domain/types";
import { ALFREDPAY_CORRIDORS } from "@/services/api/mappers";
import {
  fallbackSelfRecipient,
  mapPendingInvitationDto,
  mapRecipientDto,
  selfRecipientsFromFiatAccounts
} from "@/services/api/recipient.mappers";
import { RecipientsService } from "@/services/api/recipients.service";
import { useApprovedCorridors } from "./useApprovedCorridors";
import { useFiatAccounts } from "./useFiatAccounts";

export const RECIPIENTS_QUERY_KEY = ["recipients"] as const;

/**
 * The "send to yourself" recipients, derived from data the widget already fetches:
 * one per saved AlfredPay fiat account (US/MX/CO/AR), plus a single entry for BR/EU
 * whose payout target is captured at ramp time rather than listed. Gated by the
 * corridors the user is actually provider-approved for.
 */
function useSelfRecipients(
  account: SenderAccount | undefined,
  approved: Set<CorridorId>
): { recipients: Recipient[]; isLoading: boolean } {
  const us = useFiatAccounts("US", approved.has("US"));
  const mx = useFiatAccounts("MX", approved.has("MX"));
  const co = useFiatAccounts("CO", approved.has("CO"));
  const ar = useFiatAccounts("AR", approved.has("AR"));

  const recipients = useMemo(() => {
    if (!account) {
      return [];
    }
    const fiatAccountsByCorridor: Record<string, AlfredpayListFiatAccountsResponse | undefined> = {
      AR: ar.data,
      CO: co.data,
      MX: mx.data,
      US: us.data
    };
    const out: Recipient[] = [];
    for (const corridorId of ALFREDPAY_CORRIDORS) {
      if (approved.has(corridorId)) {
        out.push(...selfRecipientsFromFiatAccounts(fiatAccountsByCorridor[corridorId] ?? [], corridorId, account));
      }
    }
    for (const corridorId of ["BR", "EU"] as CorridorId[]) {
      if (approved.has(corridorId)) {
        out.push(fallbackSelfRecipient(corridorId, account));
      }
    }
    return out;
  }, [account, approved, us.data, mx.data, co.data, ar.data]);

  return { isLoading: us.isLoading || mx.isLoading || co.isLoading || ar.isLoading, recipients };
}

/**
 * The recipient list for a sender account: self-recipients (derived from approved
 * corridors + fetched payout accounts) followed by third-party recipients + pending
 * invitations from the backend. Also returns the approved-corridor set so callers can
 * gate invite creation without a second onboarding-status fetch.
 */
export function useRecipients(account: SenderAccount | undefined): {
  recipients: Recipient[];
  approvedCorridors: Set<CorridorId>;
  isLoading: boolean;
} {
  const enabled = !!account;
  const { approved, isLoading: approvedLoading } = useApprovedCorridors(enabled);
  const listQuery = useQuery({
    enabled,
    queryFn: () => RecipientsService.list(),
    queryKey: RECIPIENTS_QUERY_KEY,
    staleTime: 30_000
  });
  const self = useSelfRecipients(account, approved);

  const thirdParty = useMemo(() => {
    if (!account || !listQuery.data) {
      return [];
    }
    const relationships = listQuery.data.recipients
      .map(dto => mapRecipientDto(dto, account.id))
      .filter((recipient): recipient is Recipient => recipient !== null);
    const pending = listQuery.data.pendingInvitations
      .map(dto => mapPendingInvitationDto(dto, account.id))
      .filter((recipient): recipient is Recipient => recipient !== null);
    return [...relationships, ...pending];
  }, [account, listQuery.data]);

  const recipients = useMemo(() => [...self.recipients, ...thirdParty], [self.recipients, thirdParty]);

  return {
    approvedCorridors: approved,
    isLoading: approvedLoading || listQuery.isLoading || self.isLoading,
    recipients
  };
}
