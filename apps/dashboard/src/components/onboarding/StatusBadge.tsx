import { CheckCircle2, CircleDashed, Clock, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_META } from "@/domain/status";
import type { OnboardingStatus } from "@/domain/types";

const ICONS: Record<OnboardingStatus, typeof CheckCircle2> = {
  approved: CheckCircle2,
  in_review: Loader2,
  not_started: CircleDashed,
  pending: Clock,
  rejected: XCircle
};

export function StatusBadge({ status }: { status: OnboardingStatus }) {
  const meta = STATUS_META[status];
  const Icon = ICONS[status];
  return (
    <Badge variant={meta.badgeVariant}>
      <Icon className={status === "in_review" ? "animate-spin" : undefined} />
      {meta.label}
    </Badge>
  );
}
