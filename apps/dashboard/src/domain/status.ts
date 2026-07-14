import type { OnboardingStatus, RecipientStatus, TransactionStatus } from "./types";

interface StatusMeta {
  label: string;
  badgeVariant: "secondary" | "info" | "warning" | "success" | "destructive";
  /** 0-100, drives the corridor progress bar. */
  progress: number;
}

export const STATUS_META: Record<OnboardingStatus, StatusMeta> = {
  approved: { badgeVariant: "success", label: "Approved", progress: 100 },
  in_review: { badgeVariant: "warning", label: "In review", progress: 75 },
  not_started: { badgeVariant: "secondary", label: "Not started", progress: 0 },
  pending: { badgeVariant: "warning", label: "Pending", progress: 50 },
  rejected: { badgeVariant: "destructive", label: "Rejected", progress: 100 },
  started: { badgeVariant: "info", label: "Started", progress: 25 }
};

export const TX_STATUS_META: Record<TransactionStatus, { label: string; badgeVariant: StatusMeta["badgeVariant"] }> = {
  awaiting_payin: { badgeVariant: "warning", label: "Awaiting payin" },
  cancelled: { badgeVariant: "secondary", label: "Cancelled" },
  completed: { badgeVariant: "success", label: "Completed" },
  failed: { badgeVariant: "destructive", label: "Failed" },
  processing: { badgeVariant: "info", label: "Processing" }
};

/** Recipient tab shows compliance status only (§6) — payment status lives in Transactions. */
export const RECIPIENT_STATUS_META: Record<RecipientStatus, { label: string; badgeVariant: StatusMeta["badgeVariant"] }> = {
  approved: { badgeVariant: "success", label: "Approved" },
  invite_sent: { badgeVariant: "secondary", label: "Invite sent" },
  pending: { badgeVariant: "info", label: "Pending" },
  rejected: { badgeVariant: "destructive", label: "Rejected" }
};
