import type { OnboardingStatus, TransactionStatus } from "./types";

interface StatusMeta {
  label: string;
  badgeVariant: "secondary" | "info" | "warning" | "success" | "destructive";
  /** 0-100, drives the corridor progress bar. */
  progress: number;
}

export const STATUS_META: Record<OnboardingStatus, StatusMeta> = {
  approved: { badgeVariant: "success", label: "Approved", progress: 100 },
  in_review: { badgeVariant: "warning", label: "In review", progress: 66 },
  not_started: { badgeVariant: "secondary", label: "Not started", progress: 0 },
  pending: { badgeVariant: "info", label: "Pending", progress: 33 },
  rejected: { badgeVariant: "destructive", label: "Rejected", progress: 100 }
};

export const TX_STATUS_META: Record<TransactionStatus, { label: string; badgeVariant: StatusMeta["badgeVariant"] }> = {
  completed: { badgeVariant: "success", label: "Completed" },
  failed: { badgeVariant: "destructive", label: "Failed" },
  processing: { badgeVariant: "info", label: "Processing" }
};
