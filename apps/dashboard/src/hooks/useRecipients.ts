import { useQuery } from "@tanstack/react-query";
import type { AlfredpayListFiatAccountsResponse } from "@vortexfi/shared";
import { useMemo } from "react";
import { CORRIDORS } from "@/domain/corridors";
import type { CorridorId, Recipient, SenderAccount } from "@/domain/types";
import { AlfredpayService } from "@/services/api/alfredpay.service";
import { ALFREDPAY_CORRIDORS } from "@/services/api/mappers";
import {
  fallbackSelfRecipient,
  mapPendingInvitationDto,
  mapRecipientDto,
  selfRecipientsFromFiatAccounts
} from "@/services/api/recipient.mappers";
import { RecipientsService } from "@/services/api/recipients.service";

export const RECIPIENTS_QUERY_KEY = ["recipients"] as const;

const FIVE_MINUTES = 5 * 60_000;

function isCorridorApproved(account: SenderAccount | undefined, corridorId: CorridorId): boolean {
  const corridor = CORRIDORS[corridorId];
  return !!account && corridor.availability === "live" && account.onboardings[corridorId]?.status === "approved";
}

/** Saved AlfredPay payout accounts for a corridor. A missing customer 404s → treated as none. */
function useFiatAccounts(corridorId: CorridorId, enabled: boolean) {
  return useQuery<AlfredpayListFiatAccountsResponse>({
    enabled,
    queryFn: ({ signal }) => AlfredpayService.listFiatAccounts(corridorId, signal),
    queryKey: ["fiatAccounts", corridorId],
    retry: false,
    staleTime: FIVE_MINUTES
  });
}

/**
 * The "send to yourself" recipients, derived from data the widget already fetches:
 * one per saved AlfredPay fiat account (US/MX/CO/AR), plus a single entry for BR/EU
 * whose payout target is captured at ramp time rather than listed.
 */
function useSelfRecipients(account: SenderAccount | undefined): { recipients: Recipient[]; isLoading: boolean } {
  const us = useFiatAccounts("US", isCorridorApproved(account, "US"));
  const mx = useFiatAccounts("MX", isCorridorApproved(account, "MX"));
  const co = useFiatAccounts("CO", isCorridorApproved(account, "CO"));
  const ar = useFiatAccounts("AR", isCorridorApproved(account, "AR"));

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
      if (!isCorridorApproved(account, corridorId)) {
        continue;
      }
      out.push(...selfRecipientsFromFiatAccounts(fiatAccountsByCorridor[corridorId] ?? [], corridorId, account));
    }
    for (const corridorId of ["BR", "EU"] as CorridorId[]) {
      if (isCorridorApproved(account, corridorId)) {
        out.push(fallbackSelfRecipient(corridorId, account));
      }
    }
    return out;
  }, [account, us.data, mx.data, co.data, ar.data]);

  return { isLoading: us.isLoading || mx.isLoading || co.isLoading || ar.isLoading, recipients };
}

/**
 * The recipient list for a sender account: self-recipients (derived from fetched payout
 * accounts) followed by third-party recipients + pending invitations from the backend.
 */
export function useRecipients(account: SenderAccount | undefined): { recipients: Recipient[]; isLoading: boolean } {
  const listQuery = useQuery({
    enabled: !!account,
    queryFn: () => RecipientsService.list(),
    queryKey: RECIPIENTS_QUERY_KEY,
    staleTime: 30_000
  });
  const self = useSelfRecipients(account);

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

  return { isLoading: listQuery.isLoading || self.isLoading, recipients };
}
