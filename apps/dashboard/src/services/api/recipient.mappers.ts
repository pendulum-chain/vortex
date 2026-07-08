import type { AlfredpayFiatAccount } from "@vortexfi/shared";
import { CORRIDORS } from "@/domain/corridors";
import type { AccountType, CorridorId, Recipient, SenderAccount } from "@/domain/types";
import { CORRIDOR_BY_RAIL } from "./mappers";
import type { PendingInvitationDto, RecipientDto, RecipientInviteeType } from "./recipients.service";

/** Provider invitee types map onto the dashboard's account types. */
function toAccountType(type: RecipientInviteeType): AccountType {
  return type === "business" ? "company" : "individual";
}

/**
 * Resolves a provider/KYC account (from GET /v1/onboarding/status) to a dashboard corridor.
 * Prefers the rail (currency) code; falls back to provider + country for null rails.
 */
export function corridorFromProviderAccount(account: {
  provider: string;
  country: string | null;
  rail: string | null;
}): CorridorId | undefined {
  if (account.rail && CORRIDOR_BY_RAIL[account.rail]) {
    return CORRIDOR_BY_RAIL[account.rail];
  }
  if (account.provider === "avenia") {
    return "BR";
  }
  if (account.provider === "mykobo") {
    return "EU";
  }
  if (account.provider === "alfredpay" && account.country) {
    const country = account.country.toUpperCase();
    if (country === "US" || country === "MX" || country === "CO" || country === "AR") {
      return country as CorridorId;
    }
  }
  return undefined;
}

/** Shows only the tail of an account identifier — never the full number. */
function maskAccountNumber(value: string): string {
  return value.length <= 4 ? value : `••••${value.slice(-4)}`;
}

/**
 * Maps an accepted relationship to a third-party recipient. Returns null when the rail
 * doesn't resolve to a supported corridor (nothing sensible to render).
 */
export function mapRecipientDto(dto: RecipientDto, accountId: string): Recipient | null {
  const corridorId = dto.invitation ? CORRIDOR_BY_RAIL[dto.invitation.rail] : undefined;
  if (!corridorId) {
    return null;
  }
  const corridor = CORRIDORS[corridorId];
  const payoutReference = dto.payoutReferences[0];
  return {
    accountId,
    amount: "0.00",
    bankDetails: { method: corridor.recipientMethod, value: payoutReference?.maskedDisplayLabel ?? "" },
    copyCount: 0,
    corridorId,
    createdAt: dto.createdAt,
    email: dto.invitation?.inviteeEmail ?? "",
    id: dto.id,
    inviteCode: "",
    isSelf: false,
    name: dto.nickname ?? dto.invitation?.inviteeEmail ?? undefined,
    payoutCurrency: corridor.currency,
    recipientType: toAccountType(dto.recipientType),
    status: dto.onboardingStatus === "approved" ? "approved" : "pending"
  };
}

/**
 * Maps a not-yet-accepted invitation to a recipient row. The raw invite token is only
 * returned at creation time, so listed invitations carry no re-copyable link.
 */
export function mapPendingInvitationDto(dto: PendingInvitationDto, accountId: string): Recipient | null {
  const corridorId = CORRIDOR_BY_RAIL[dto.rail];
  if (!corridorId) {
    return null;
  }
  const corridor = CORRIDORS[corridorId];
  return {
    accountId,
    amount: "0.00",
    bankDetails: { method: corridor.recipientMethod, value: "" },
    copyCount: 0,
    corridorId,
    createdAt: dto.createdAt,
    email: dto.inviteeEmail ?? "",
    id: dto.id,
    inviteCode: "",
    isSelf: false,
    name: dto.inviteeEmail ?? undefined,
    payoutCurrency: corridor.currency,
    recipientType: toAccountType(dto.inviteeType),
    status: dto.isExpired ? "rejected" : "invite_sent"
  };
}

/**
 * One self-recipient per saved AlfredPay fiat account — the offramp registers against
 * `fiatAccountId`, so each account is a distinct "send to yourself" destination.
 */
export function selfRecipientsFromFiatAccounts(
  accounts: AlfredpayFiatAccount[],
  corridorId: CorridorId,
  account: SenderAccount
): Recipient[] {
  const corridor = CORRIDORS[corridorId];
  return accounts.map(fiatAccount => {
    const label = fiatAccount.accountName
      ? `${fiatAccount.accountName} · ${maskAccountNumber(fiatAccount.accountNumber)}`
      : maskAccountNumber(fiatAccount.accountNumber);
    return {
      accountId: account.id,
      amount: "0.00",
      bankDetails: { method: corridor.recipientMethod, value: label },
      copyCount: 0,
      corridorId,
      createdAt: fiatAccount.createdAt ?? "",
      email: "",
      fiatAccountId: fiatAccount.fiatAccountId,
      id: `self_${corridorId}_${fiatAccount.fiatAccountId}`,
      inviteCode: "",
      isSelf: true,
      name: `${account.name} · ${label}`,
      payoutCurrency: corridor.currency,
      recipientType: account.type,
      status: "approved"
    };
  });
}

/**
 * A single self-recipient for corridors without a fetchable payout-account list
 * (BR pix/tax id is entered at ramp time; EU IBAN is handled by the anchor).
 */
export function fallbackSelfRecipient(corridorId: CorridorId, account: SenderAccount): Recipient {
  const corridor = CORRIDORS[corridorId];
  return {
    accountId: account.id,
    amount: "0.00",
    bankDetails: { method: corridor.recipientMethod, value: `Your ${corridor.name} ${corridor.recipientLabel}` },
    copyCount: 0,
    corridorId,
    createdAt: "",
    email: "",
    id: `self_${corridorId}`,
    inviteCode: "",
    isSelf: true,
    name: `${account.name} (You)`,
    payoutCurrency: corridor.currency,
    recipientType: account.type,
    status: "approved"
  };
}
