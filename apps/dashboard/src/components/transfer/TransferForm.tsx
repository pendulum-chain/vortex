import { useNavigate } from "@tanstack/react-router";
import { QuoteError } from "@vortexfi/shared";
import { useSelector } from "@xstate/react";
import { Lock, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CORRIDORS } from "@/domain/corridors";
import { recipientLabel } from "@/domain/recipient";
import { RECIPIENT_STATUS_META } from "@/domain/status";
import { PAYMENT_METHOD_LABEL, TRANSFER_NETWORKS } from "@/domain/transfer";
import type { Recipient, SenderAccount } from "@/domain/types";
import { buildTransferAdditionalData } from "@/machines/registerAdditionalData";
import { transferActor } from "@/machines/transferActor";
import { useOfframpQuote } from "@/services/api/hooks";
import { FundingMethods, type FundingSubmit } from "./FundingMethods";
import { QuoteSummary } from "./QuoteSummary";

interface TransferFormProps {
  account: SenderAccount;
  recipients: Recipient[];
  preselectRecipientId?: string;
}

function extractBackendLimit(message: string): { value: string; currency: string } | undefined {
  const match = message.match(/of\s+(\d+(?:\.\d+)?)\s+([A-Z]{3})/);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  return { currency: match[2], value: match[1] };
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

  const firstSelfApproved = recipients.find(recipient => recipient.isSelf && recipient.status === "approved");
  const initialId = preselectRecipientId ?? firstSelfApproved?.id ?? "";
  const [recipientId, setRecipientId] = useState(initialId);
  const [network, setNetwork] = useState<string>(TRANSFER_NETWORKS[0].id);
  const [amount, setAmount] = useState(() => recipients.find(recipient => recipient.id === initialId)?.amount ?? "");
  const [pixKey, setPixKey] = useState("");

  const selected = recipients.find(recipient => recipient.id === recipientId);
  // Only self-recipients are sendable today; third-party sending is coming soon.
  const isSendable = selected?.isSelf === true && selected.status === "approved";
  const corridor = selected ? CORRIDORS[selected.corridorId] : undefined;
  const networkLabel = TRANSFER_NETWORKS.find(item => item.id === network)?.label ?? network;
  const payoutAmount = Number(amount);
  // BRL offramps pay out to the user's own PIX key; taxId/receiverTaxId are derived server-side.
  const needsPixKey = selected?.corridorId === "BR" && selected.isSelf === true;
  const pixReady = !needsPixKey || pixKey.trim().length > 0;

  function selectRecipient(id: string) {
    setRecipientId(id);
    setAmount(recipients.find(recipient => recipient.id === id)?.amount ?? "");
    setPixKey("");
  }

  // The transfer machine (ported widget ramp core) owns register → sign → start → track.
  const transferState = useSelector(transferActor, snapshot => snapshot.value);
  const submitting = transferState === "Registering" || transferState === "SigningUserTxs" || transferState === "Starting";
  const activeTransfer = useSelector(
    transferActor,
    snapshot =>
      snapshot.matches("Registering") ||
      snapshot.matches("SigningUserTxs") ||
      snapshot.matches("Starting") ||
      snapshot.matches("Tracking")
  );
  const signing = useSelector(transferActor, snapshot => snapshot.matches("SigningUserTxs"));

  const quoteParams =
    selected && isSendable && payoutAmount > 0 ? { corridorId: selected.corridorId, network, payoutAmount } : null;
  const { data: quote, isFetching, error } = useOfframpQuote(quoteParams);

  function submitTransfer(submit: FundingSubmit) {
    if (!selected || !isSendable || !quote || activeTransfer || !pixReady) {
      return;
    }
    const label = recipientLabel(selected);
    const summary = `${quote.outputAmount} ${selected.payoutCurrency} to ${label}`;

    // One-shot outcome watcher: navigate when tracking begins, surface the error
    // when any stage fails. The actor keeps polling after this form unmounts.
    const subscription = transferActor.subscribe(snapshot => {
      if (snapshot.matches("Tracking")) {
        subscription.unsubscribe();
        toast.success("Transfer initiated", {
          description: `Funding via ${submit.label} — we'll pay out ${summary} once your ${quote.inputAmount} USDC lands.`
        });
        navigate({ to: "/transactions" });
      } else if (snapshot.matches("Failed")) {
        subscription.unsubscribe();
        toast.error("Could not start transfer", { description: snapshot.context.errorMessage ?? undefined });
      }
    });

    transferActor.send({
      additionalData: buildTransferAdditionalData(selected, submit.destAddress, pixKey.trim() || undefined),
      meta: {
        accountId: account.id,
        amountIn: quote.inputAmount,
        amountInToken: "USDC",
        corridorId: selected.corridorId,
        fiatPayoutAmount: quote.outputAmount,
        payinNetwork: network,
        payoutCurrency: selected.payoutCurrency,
        recipientEmail: label,
        recipientId: selected.id,
        summary
      },
      quote,
      type: "START"
    });
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
            {recipients.map(recipient => {
              // Third-party sending isn't available yet — those rows are disabled with a
              // "coming soon" tooltip; a self-recipient still awaiting KYC is disabled too.
              if (!recipient.isSelf) {
                return (
                  <SelectItem className="text-muted-foreground" disabled key={recipient.id} value={recipient.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="pointer-events-auto">
                          {recipientLabel(recipient)} · {CORRIDORS[recipient.corridorId].name} — Coming soon
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Coming soon — sending to third-party recipients isn't available yet.</TooltipContent>
                    </Tooltip>
                  </SelectItem>
                );
              }
              return (
                <SelectItem disabled={recipient.status !== "approved"} key={recipient.id} value={recipient.id}>
                  {recipientLabel(recipient)} · {CORRIDORS[recipient.corridorId].name}
                  {recipient.status !== "approved" && ` — ${RECIPIENT_STATUS_META[recipient.status].label}`}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          You can send to your own payout accounts. Third-party sending is coming soon.
        </p>
      </div>

      {selected && !isSendable && (
        <div className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-sm">
          <Lock className="size-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            {selected.isSelf
              ? `${recipientLabel(selected)} is ${RECIPIENT_STATUS_META[selected.status].label.toLowerCase()}. Transfers stay blocked until it's approved.`
              : "Sending to third-party recipients is coming soon — you can only pay your own payout accounts for now."}
          </p>
        </div>
      )}

      {selected && isSendable && corridor && (
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

          {needsPixKey && (
            <div className="grid gap-1.5">
              <Label htmlFor="pix-key">Your PIX key</Label>
              <Input
                id="pix-key"
                onChange={event => setPixKey(event.target.value)}
                placeholder="CPF, phone, email or random key"
                value={pixKey}
              />
              <p className="text-muted-foreground text-xs">
                We pay out to your own PIX key — it must be registered to your tax ID.
              </p>
            </div>
          )}

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

          {activeTransfer && !submitting ? (
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <Lock className="mt-px size-4 shrink-0 text-primary" />
              <p>A transfer is already in progress. Wait for it to finish before starting another.</p>
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <TriangleAlert className="mt-px size-4 shrink-0 text-destructive" />
              <p className="text-destructive">{friendlyQuoteError(error.message)}</p>
            </div>
          ) : payoutAmount <= 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
              Enter an amount to see the quote.
            </p>
          ) : !pixReady ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
              Enter your PIX key to continue.
            </p>
          ) : quote ? (
            <>
              <QuoteSummary isFetching={isFetching} quote={quote} />
              <FundingMethods
                network={network}
                networkLabel={networkLabel}
                onSubmit={submitTransfer}
                quote={quote}
                submitting={submitting}
              />
              {signing && (
                <p className="rounded-lg border border-dashed p-3 text-center text-muted-foreground text-sm">
                  Confirm the signature request in your wallet to authorize the transfer…
                </p>
              )}
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
