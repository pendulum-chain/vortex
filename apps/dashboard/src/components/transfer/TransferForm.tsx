import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Copy, Lock, TriangleAlert, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CORRIDORS } from "@/domain/corridors";
import { RECIPIENT_STATUS_META } from "@/domain/status";
import { mockPayinAddress, PAYMENT_METHOD_LABEL, shortenAddress, TRANSFER_NETWORKS, USDC_RATES } from "@/domain/transfer";
import type { Recipient, SenderAccount } from "@/domain/types";
import { springSnappy } from "@/lib/motion";
import { notifyTransferCompleted } from "@/lib/notify";
import { useDashboardStore } from "@/stores/dashboard.store";

interface TransferFormProps {
  account: SenderAccount;
  recipients: Recipient[];
  preselectRecipientId?: string;
}

export function TransferForm({ account, recipients, preselectRecipientId }: TransferFormProps) {
  const navigate = useNavigate();
  const addTransaction = useDashboardStore(state => state.addTransaction);
  const setTransactionStatus = useDashboardStore(state => state.setTransactionStatus);

  const firstApproved = recipients.find(recipient => recipient.status === "approved");
  const [recipientId, setRecipientId] = useState(preselectRecipientId ?? firstApproved?.id ?? "");
  const [network, setNetwork] = useState<string>(TRANSFER_NETWORKS[0].id);
  const [confirming, setConfirming] = useState(false);

  const selected = recipients.find(recipient => recipient.id === recipientId);
  const isApproved = selected?.status === "approved";
  const corridor = selected ? CORRIDORS[selected.corridorId] : undefined;

  const amountIn = selected ? Number(selected.amount) / USDC_RATES[selected.corridorId] : 0;
  const networkLabel = TRANSFER_NETWORKS.find(item => item.id === network)?.label ?? network;
  const payinWallet = selected ? mockPayinAddress(`${selected.id}-${network}`) : "";

  function copyAddress() {
    navigator.clipboard?.writeText(payinWallet);
    toast.success("Payin address copied");
  }

  function onConfirm() {
    if (!selected || !isApproved) {
      return;
    }
    const id = addTransaction({
      accountId: account.id,
      amountIn: amountIn.toFixed(2),
      amountInToken: "USDC",
      corridorId: selected.corridorId,
      fiatPayoutAmount: selected.amount,
      payinNetwork: network,
      payinWallet,
      payoutCurrency: selected.payoutCurrency,
      recipientEmail: selected.email,
      recipientId: selected.id,
      status: "awaiting_payin"
    });
    const summary = `${selected.amount} ${selected.payoutCurrency} to ${selected.email}`;
    toast.success("Transfer initiated", {
      description: `Watching for your ${amountIn.toFixed(2)} USDC deposit — we'll pay out ${summary} once it lands.`
    });
    // Mock the payin landing in the wallet, then the provider settling the fiat payout.
    // Staged over a few seconds so the awaiting → processing → completed lifecycle is visible.
    setTimeout(() => setTransactionStatus(id, "processing"), 2500);
    setTimeout(() => {
      setTransactionStatus(id, "completed");
      notifyTransferCompleted(`Payout of ${summary}`);
    }, 6000);
    navigate({ to: "/transactions" });
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label>Recipient</Label>
        <Select
          onValueChange={value => {
            setRecipientId(value);
            setConfirming(false);
          }}
          value={recipientId}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a recipient" />
          </SelectTrigger>
          <SelectContent>
            {recipients.map(recipient => (
              <SelectItem disabled={recipient.status !== "approved"} key={recipient.id} value={recipient.id}>
                {recipient.email} · {CORRIDORS[recipient.corridorId].name}
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
            {selected.email} is {RECIPIENT_STATUS_META[selected.status].label.toLowerCase()}. Transfers stay blocked until this
            recipient is approved.
          </p>
        </div>
      )}

      {selected && isApproved && corridor && (
        <>
          <div className="surface-raised grid gap-3 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Recipient gets</span>
              <span className="font-semibold text-lg">
                {selected.amount} {selected.payoutCurrency}
              </span>
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
            <Select
              onValueChange={value => {
                setNetwork(value);
                setConfirming(false);
              }}
              value={network}
            >
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
            <p className="text-muted-foreground text-xs">
              The network your wallet sends from. The payin address below is specific to {networkLabel}.
            </p>
          </div>

          <div className="surface-raised grid gap-3 rounded-lg bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Wallet className="size-4 text-primary" />
              <span className="font-medium text-sm">Vortex wallet payin</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="cursor-help" variant="secondary">
                    Privy
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>A wallet Vortex creates and secures for you via Privy. No setup needed.</TooltipContent>
              </Tooltip>
            </div>
            <p className="text-muted-foreground text-sm">
              Send <span className="font-medium text-foreground tabular-nums">≈ {amountIn.toFixed(2)} USDC</span> on{" "}
              <span className="font-medium text-foreground">{networkLabel}</span> to this address. We pay{" "}
              {selected.payoutCurrency} to the recipient's bank once it lands.
            </p>
            <div className="grid gap-1">
              <span className="text-muted-foreground text-xs">Send on {networkLabel} to</span>
              <div className="flex items-center gap-2 rounded-md border bg-background p-2">
                <code className="flex-1 truncate font-mono text-xs">{payinWallet}</code>
                <Button onClick={copyAddress} size="sm" type="button" variant="ghost">
                  <Copy />
                  Copy
                </Button>
              </div>
            </div>
            <p className="flex items-start gap-2 text-muted-foreground text-xs">
              <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning-foreground" />
              Crypto transfers are irreversible. Confirm your wallet is on {networkLabel} and the address matches before
              sending.
            </p>
          </div>

          <AnimatePresence initial={false} mode="wait">
            {confirming ? (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="grid gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4"
                exit={{ opacity: 0, y: -6 }}
                initial={{ opacity: 0, y: 8 }}
                key="confirm"
                transition={springSnappy}
              >
                <p className="font-medium text-sm">Confirm you've sent the payin</p>
                <Row label="You send">
                  <span className="tabular-nums">≈ {amountIn.toFixed(2)}</span> USDC on {networkLabel}
                </Row>
                <Row label="To address">
                  <code className="font-mono">{shortenAddress(payinWallet)}</code>
                </Row>
                <Row label="Recipient gets">
                  {selected.amount} {selected.payoutCurrency} · {selected.email}
                </Row>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={() => setConfirming(false)} type="button" variant="outline">
                    <ChevronLeft />
                    Back
                  </Button>
                  <Button onClick={onConfirm} type="button">
                    Confirm — I've sent it
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                initial={{ opacity: 0, y: 8 }}
                key="review"
                transition={springSnappy}
              >
                <Button className="w-full" disabled={!recipientId} onClick={() => setConfirming(true)} type="button">
                  Review &amp; confirm
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
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
