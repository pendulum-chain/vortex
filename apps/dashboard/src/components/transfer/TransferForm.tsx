import { useNavigate } from "@tanstack/react-router";
import {
  EvmToken,
  getEvmTokensLoadedSnapshot,
  isEvmToken,
  Networks,
  QuoteError,
  RampDirection,
  subscribeEvmTokensLoaded
} from "@vortexfi/shared";
import { useSelector } from "@xstate/react";
import { Lock, TriangleAlert } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CORRIDORS } from "@/domain/corridors";
import { getNetworkOptions, getRampTokenOptions } from "@/domain/onramp";
import { recipientLabel } from "@/domain/recipient";
import { RECIPIENT_STATUS_META } from "@/domain/status";
import { PAYMENT_METHOD_LABEL } from "@/domain/transfer";
import type { CorridorId, Recipient, SenderAccount } from "@/domain/types";
import { formatCurrencyAmount } from "@/lib/amount";
import { buildTransferAdditionalData } from "@/machines/registerAdditionalData";
import { transferActor } from "@/machines/transferActor";
import { useQuote } from "@/services/api/hooks";
import { FundingMethods, type FundingSubmit } from "./FundingMethods";
import { QuoteSummary } from "./QuoteSummary";
import { TokenCombobox } from "./TokenCombobox";

interface OfframpPrefill {
  amount?: string;
  corridorId?: CorridorId;
  network?: string;
  token?: string;
}

interface TransferFormProps {
  account: SenderAccount;
  prefill?: OfframpPrefill;
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
    return `This amount is below the minimum${suffix}. Try a larger amount.`;
  }
  if (message.includes(QuoteError.AboveUpperLimitSell)) {
    return `This amount is above the maximum${suffix}. Try a smaller amount.`;
  }
  if (message.includes(QuoteError.LowLiquidity)) {
    return QuoteError.LowLiquidity;
  }
  return "We couldn't fetch a quote right now. Please try again.";
}

export function TransferForm({ account, prefill, recipients, preselectRecipientId }: TransferFormProps) {
  const navigate = useNavigate();

  const firstSelfApproved = recipients.find(recipient => recipient.isSelf && recipient.status === "approved");
  const corridorMatch = recipients.find(
    recipient => recipient.isSelf && recipient.status === "approved" && recipient.corridorId === prefill?.corridorId
  );
  const initialId = preselectRecipientId ?? corridorMatch?.id ?? firstSelfApproved?.id ?? "";
  const [recipientId, setRecipientId] = useState(initialId);
  const [requestedNetwork, setRequestedNetwork] = useState(prefill?.network ?? Networks.Polygon);
  const [requestedToken, setRequestedToken] = useState(prefill?.token ?? EvmToken.USDC);
  const [amount, setAmount] = useState(prefill?.amount ?? "");
  const [pixKey, setPixKey] = useState("");

  useSyncExternalStore(subscribeEvmTokensLoaded, getEvmTokensLoadedSnapshot, () => false);
  const tokenOptions = getRampTokenOptions(RampDirection.SELL).filter(option => isEvmToken(String(option.currency)));
  const networkOptions = getNetworkOptions(tokenOptions);
  const activeNetwork = networkOptions.find(option => option.id === requestedNetwork) ?? networkOptions[0];
  const networkTokens = tokenOptions.filter(option => option.network === activeNetwork?.id);
  const token = networkTokens.find(option => option.currency === requestedToken) ?? networkTokens[0];

  const selfRecipients = recipients.filter(recipient => recipient.isSelf);
  const selected = selfRecipients.find(recipient => recipient.id === recipientId);
  const isSendable = selected?.isSelf === true && selected.status === "approved";
  const corridor = selected ? CORRIDORS[selected.corridorId] : undefined;
  const amountReady = Number(amount) > 0;
  // BRL offramps pay out to the user's own PIX key; taxId/receiverTaxId are derived server-side.
  const needsPixKey = selected?.corridorId === "BR" && selected.isSelf === true;
  const pixReady = !needsPixKey || pixKey.trim().length > 0;

  function selectRecipient(id: string) {
    setRecipientId(id);
    setAmount("");
    setPixKey("");
  }

  // The transfer machine (ported widget ramp core) owns register → sign → start → track.
  const submitting = useSelector(
    transferActor,
    snapshot =>
      snapshot.matches("CheckingQuote") ||
      snapshot.matches("CheckingBalance") ||
      snapshot.matches("Registering") ||
      snapshot.matches("SigningUserTxs") ||
      snapshot.matches("Starting")
  );
  // The API permits parallel ramps, but this dashboard intentionally owns one local
  // transfer actor. Only states whose machine handles START may begin another transfer.
  const canStartTransfer = useSelector(
    transferActor,
    snapshot => snapshot.matches("Idle") || snapshot.matches("Done") || snapshot.matches("Failed")
  );
  const signing = useSelector(transferActor, snapshot => snapshot.matches("SigningUserTxs"));

  const quoteParams =
    selected && isSendable && amountReady && token
      ? {
          corridorId: selected.corridorId,
          direction: RampDirection.SELL,
          inputAmount: amount,
          network: token.network,
          token: token.currency
        }
      : null;
  const { data: quote, isFetching, error } = useQuote(quoteParams);

  function submitTransfer(submit: FundingSubmit) {
    if (!selected || !isSendable || !quote || !quoteParams || !canStartTransfer || !pixReady) {
      return;
    }
    const label = recipientLabel(selected);
    const summary = `${formatCurrencyAmount(quote.outputAmount, selected.payoutCurrency)} ${selected.payoutCurrency} to ${label}`;

    // One-shot outcome watcher: navigate when tracking begins, surface the error
    // when any stage fails. The actor keeps polling after this form unmounts.
    const subscription = transferActor.subscribe(snapshot => {
      if (snapshot.matches("Tracking")) {
        subscription.unsubscribe();
        const currentMeta = snapshot.context.meta;
        const currentQuote = snapshot.context.quote;
        toast.success("Transfer initiated", {
          description: `Funding via ${submit.label} — we'll pay out ${currentMeta?.summary ?? summary} once your ${formatCurrencyAmount(currentQuote?.inputAmount ?? quote.inputAmount, String(currentQuote?.inputCurrency ?? quote.inputCurrency))} ${currentQuote?.inputCurrency ?? quote.inputCurrency} lands.`
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
        amountInToken: String(quote.inputCurrency),
        corridorId: selected.corridorId,
        direction: quote.rampType,
        fiatPayoutAmount: quote.outputAmount,
        payinNetwork: String(quote.network),
        payoutCurrency: selected.payoutCurrency,
        recipientEmail: label,
        recipientId: selected.id,
        summary
      },
      quote,
      quoteRequest: { kind: "input", params: quoteParams },
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
            {selfRecipients.map(recipient => {
              return (
                <SelectItem disabled={recipient.status !== "approved"} key={recipient.id} value={recipient.id}>
                  {recipientLabel(recipient)} · {CORRIDORS[recipient.corridorId].name}
                  {recipient.status !== "approved" && ` — ${RECIPIENT_STATUS_META[recipient.status].label}`}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">Choose one of your approved pay-out accounts.</p>
      </div>

      {selected && !isSendable && (
        <div className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-sm">
          <Lock className="size-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            {`${recipientLabel(selected)} is ${RECIPIENT_STATUS_META[selected.status].label.toLowerCase()}. Transfers stay blocked until it's approved.`}
          </p>
        </div>
      )}

      {selected && isSendable && corridor && (
        <>
          <div className="surface-raised grid gap-3 rounded-lg p-4">
            <div className="grid gap-1.5">
              <Label htmlFor="token-amount">You send ({token?.label ?? "token"})</Label>
              <div className="flex items-center gap-2">
                <Input
                  className="text-lg tabular-nums"
                  id="token-amount"
                  inputMode="decimal"
                  onChange={event => setAmount(event.target.value)}
                  placeholder="0.00"
                  value={amount}
                />
                <span className="font-medium text-muted-foreground text-sm">{token?.label}</span>
              </div>
              <p className="text-muted-foreground text-xs">Enter the token amount to convert into fiat.</p>
            </div>
            <Row label="Country">
              {corridor.flag} {corridor.name}
            </Row>
            <Row label="Pay-out method">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Network</Label>
              <Select onValueChange={setRequestedNetwork} value={activeNetwork?.id}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {networkOptions.map(item => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Token</Label>
              <TokenCombobox
                onChange={option => setRequestedToken(String(option.currency))}
                options={networkTokens}
                value={String(token?.currency ?? "")}
              />
            </div>
          </div>

          {!canStartTransfer && !submitting ? (
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <Lock className="mt-px size-4 shrink-0 text-primary" />
              <p>This dashboard handles one transfer at a time. Finish or resume it before starting another.</p>
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <TriangleAlert className="mt-px size-4 shrink-0 text-destructive" />
              <p className="text-destructive">{friendlyQuoteError(error.message)}</p>
            </div>
          ) : !amountReady ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
              Enter an amount to see the quote.
            </p>
          ) : !pixReady ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
              Enter your PIX key to continue.
            </p>
          ) : quote && token ? (
            <>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <span className="text-muted-foreground text-sm">Recipient gets</span>
                <span className="font-semibold tabular-nums">
                  {formatCurrencyAmount(quote.outputAmount, String(quote.outputCurrency))} {String(quote.outputCurrency)}
                </span>
              </div>
              <QuoteSummary isFetching={isFetching} quote={quote} />
              <FundingMethods
                disabled={!canStartTransfer || isFetching}
                onSubmit={submitTransfer}
                quote={quote}
                submitting={submitting || isFetching}
                token={token}
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
