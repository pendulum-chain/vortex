import { useNavigate } from "@tanstack/react-router";
import { Lock, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CORRIDORS } from "@/domain/corridors";
import { recipientLabel } from "@/domain/recipient";
import { RECIPIENT_STATUS_META } from "@/domain/status";
import { PAYMENT_METHOD_LABEL, TRANSFER_NETWORKS } from "@/domain/transfer";
import type { Recipient, SenderAccount } from "@/domain/types";
import { notifyTransferCompleted } from "@/lib/notify";
import { useOfframpQuote, useRegisterRamp, useStartRamp } from "@/services/api/hooks";
import { mapPhaseToStatus, pollRampStatus } from "@/services/api/ramp.service";
import { extractBackendLimit, QuoteError } from "@/services/api/types";
import { useDashboardStore } from "@/stores/dashboard.store";
import { FundingMethods, type FundingSubmit } from "./FundingMethods";
import { QuoteSummary } from "./QuoteSummary";

interface TransferFormProps {
  account: SenderAccount;
  recipients: Recipient[];
  preselectRecipientId?: string;
}

function friendlyQuoteError(message: string): string {
  const limit = extractBackendLimit(message);
  const suffix = limit ? ` of ${limit.value} ${limit.currency}` : "";
  if (message.includes(QuoteError.BelowLowerLimitSell)) {
    return `This amount is below the minimum${suffix}. Try a larger payout.`;
  }
  if (message.includes(QuoteError.AboveUpperLimitSell)) {
    return `This amount is above the maximum${suffix}. Try a smaller payout.`;
  }
  if (message.includes(QuoteError.LowLiquidity)) {
    return QuoteError.LowLiquidity;
  }
  return "We couldn't fetch a quote right now. Please try again.";
}

export function TransferForm({ account, recipients, preselectRecipientId }: TransferFormProps) {
  const navigate = useNavigate();
  const addTransaction = useDashboardStore(state => state.addTransaction);
  const setTransactionStatus = useDashboardStore(state => state.setTransactionStatus);

  const firstApproved = recipients.find(recipient => recipient.status === "approved");
  const initialId = preselectRecipientId ?? firstApproved?.id ?? "";
  const [recipientId, setRecipientId] = useState(initialId);
  const [network, setNetwork] = useState<string>(TRANSFER_NETWORKS[0].id);
  const [amount, setAmount] = useState(() => recipients.find(recipient => recipient.id === initialId)?.amount ?? "");

  const selected = recipients.find(recipient => recipient.id === recipientId);
  const isApproved = selected?.status === "approved";
  const corridor = selected ? CORRIDORS[selected.corridorId] : undefined;
  const networkLabel = TRANSFER_NETWORKS.find(item => item.id === network)?.label ?? network;
  const payoutAmount = Number(amount);

  function selectRecipient(id: string) {
    setRecipientId(id);
    setAmount(recipients.find(recipient => recipient.id === id)?.amount ?? "");
  }

  const registerRamp = useRegisterRamp();
  const startRamp = useStartRamp();
  const submitting = registerRamp.isPending || startRamp.isPending;

  const quoteParams =
    selected && isApproved && payoutAmount > 0 ? { corridorId: selected.corridorId, network, payoutAmount } : null;
  const { data: quote, isFetching, error } = useOfframpQuote(quoteParams);

  async function submitTransfer(submit: FundingSubmit) {
    if (!selected || !isApproved || !quote) {
      return;
    }
    const label = recipientLabel(selected);
    const summary = `${quote.outputAmount} ${selected.payoutCurrency} to ${label}`;
    try {
      const { rampProcess } = await registerRamp.mutateAsync({
        additionalData: {
          destinationAddress: selected.bankDetails.value,
          email: selected.email,
          walletAddress: submit.destAddress
        },
        quote
      });
      const txId = addTransaction({
        accountId: account.id,
        amountIn: quote.inputAmount,
        amountInToken: "USDC",
        corridorId: selected.corridorId,
        fiatPayoutAmount: quote.outputAmount,
        payinNetwork: network,
        payinWallet: rampProcess.walletAddress ?? submit.destAddress,
        payoutCurrency: selected.payoutCurrency,
        recipientEmail: label,
        recipientId: selected.id,
        status: "awaiting_payin"
      });
      toast.success("Transfer initiated", {
        description: `Funding via ${submit.label} — we'll pay out ${summary} once your ${quote.inputAmount} USDC lands.`
      });
      await startRamp.mutateAsync(rampProcess.id);
      pollRampStatus(rampProcess.id, status => {
        const domainStatus = mapPhaseToStatus(status.currentPhase);
        setTransactionStatus(txId, domainStatus);
        if (domainStatus === "completed") {
          notifyTransferCompleted(`Payout of ${summary}`);
        }
      });
      navigate({ to: "/transactions" });
    } catch (submitError) {
      toast.error("Could not start transfer", {
        description: submitError instanceof Error ? submitError.message : undefined
      });
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label>Recipient</Label>
        <Select onValueChange={selectRecipient} value={recipientId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a recipient" />
          </SelectTrigger>
          <SelectContent>
            {recipients.map(recipient => (
              <SelectItem disabled={recipient.status !== "approved"} key={recipient.id} value={recipient.id}>
                {recipientLabel(recipient)} · {CORRIDORS[recipient.corridorId].name}
                {recipient.status !== "approved" && ` — ${RECIPIENT_STATUS_META[recipient.status].label}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">Only approved recipients can receive a transfer.</p>
      </div>

      {selected && !isApproved && (
        <div className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-sm">
          <Lock className="size-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            {recipientLabel(selected)} is {RECIPIENT_STATUS_META[selected.status].label.toLowerCase()}. Transfers stay blocked
            until this recipient is approved.
          </p>
        </div>
      )}

      {selected && isApproved && corridor && (
        <>
          <div className="surface-raised grid gap-3 rounded-lg p-4">
            <div className="grid gap-1.5">
              <Label htmlFor="payout-amount">Recipient gets ({selected.payoutCurrency})</Label>
              <div className="flex items-center gap-2">
                <Input
                  className="text-lg tabular-nums"
                  id="payout-amount"
                  inputMode="decimal"
                  onChange={event => setAmount(event.target.value)}
                  placeholder="0.00"
                  value={amount}
                />
                <span className="font-medium text-muted-foreground text-sm">{selected.payoutCurrency}</span>
              </div>
              <p className="text-muted-foreground text-xs">Edit the amount anytime — the quote updates automatically.</p>
            </div>
            <Row label="Country">
              {corridor.flag} {corridor.name}
            </Row>
            <Row label="Payout method">
              {PAYMENT_METHOD_LABEL[selected.bankDetails.method]} · {selected.bankDetails.value}
            </Row>
          </div>

          <div className="grid gap-2">
            <Label>Payin network</Label>
            <Select onValueChange={setNetwork} value={network}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSFER_NETWORKS.map(item => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <TriangleAlert className="mt-px size-4 shrink-0 text-destructive" />
              <p className="text-destructive">{friendlyQuoteError(error.message)}</p>
            </div>
          ) : payoutAmount <= 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
              Enter an amount to see the quote.
            </p>
          ) : quote ? (
            <>
              <QuoteSummary isFetching={isFetching} quote={quote} />
              <FundingMethods
                network={network}
                networkLabel={networkLabel}
                onSubmit={submitTransfer}
                quote={quote}
                recipient={selected}
                submitting={submitting}
              />
            </>
          ) : (
            <div className="grid gap-3">
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
