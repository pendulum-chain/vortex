import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpFromLine, Globe2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CORRIDORS } from "@/domain/corridors";
import { PAYMENT_METHOD_LABEL, shortenAddress, TRANSFER_NETWORKS, USDC_RATES } from "@/domain/transfer";
import type { Corridor, CorridorId, SenderAccount } from "@/domain/types";
import { notifyTransferCompleted } from "@/lib/notify";
import { useDashboardStore } from "@/stores/dashboard.store";

const CORRIDOR_IDS = ["BR", "EU", "MX", "CO", "US", "AR"] as const;

type TransferMode = "onramp" | "offramp" | "international";

const schema = z
  .object({
    amount: z.string().refine(value => Number(value) > 0, "Enter an amount"),
    corridorId: z.enum(CORRIDOR_IDS),
    destinationCorridorId: z.enum(CORRIDOR_IDS).optional(),
    mode: z.enum(["onramp", "offramp", "international"]),
    network: z.string().min(1),
    recipientId: z.string().optional(),
    walletAddress: z.string().min(6, "Enter a wallet address")
  })
  .superRefine((values, ctx) => {
    if (values.mode === "onramp") {
      return;
    }
    if (values.mode === "international" && !values.destinationCorridorId) {
      ctx.addIssue({ code: "custom", message: "Select a destination country", path: ["destinationCorridorId"] });
    }
    if (!values.recipientId) {
      ctx.addIssue({ code: "custom", message: "Select a recipient", path: ["recipientId"] });
    }
  });

type FormValues = z.infer<typeof schema>;

export function TransferForm({ account, approvedCorridors }: { account: SenderAccount; approvedCorridors: Corridor[] }) {
  const navigate = useNavigate();
  const recipients = useDashboardStore(state => state.recipients);
  const addTransaction = useDashboardStore(state => state.addTransaction);
  const setTransactionStatus = useDashboardStore(state => state.setTransactionStatus);

  const firstCorridor = approvedCorridors[0]?.id ?? "BR";
  const form = useForm<FormValues>({
    defaultValues: {
      amount: "",
      corridorId: firstCorridor,
      destinationCorridorId: undefined,
      mode: "offramp",
      network: TRANSFER_NETWORKS[0].id,
      recipientId: undefined,
      walletAddress: ""
    },
    resolver: zodResolver(schema)
  });

  const mode = form.watch("mode");
  const corridorId = form.watch("corridorId");
  const destinationCorridorId = form.watch("destinationCorridorId");
  const amount = form.watch("amount");

  const isOnramp = mode === "onramp";
  const isInternational = mode === "international";
  const needsRecipient = mode === "offramp" || mode === "international";

  // The corridor whose fiat rail, recipient and currency settle the transfer.
  const payoutCorridorId: CorridorId = isInternational && destinationCorridorId ? destinationCorridorId : corridorId;
  const payoutCorridor = CORRIDORS[payoutCorridorId];

  // International (cross-corridor payout) requires a KYB'd company verified in 2+ corridors.
  const canGoInternational = account.type === "company" && approvedCorridors.length >= 2;
  const destinationOptions = approvedCorridors.filter(corridor => corridor.id !== corridorId);
  const payoutRecipients = recipients.filter(
    recipient =>
      recipient.accountId === account.id && recipient.corridorId === payoutCorridorId && recipient.status === "registered"
  );

  const rate = USDC_RATES[payoutCorridorId];
  const amountNum = Number(amount) || 0;
  const sendCurrency = isOnramp ? CORRIDORS[corridorId].currency : "USDC";
  const receiveCurrency = isOnramp ? "USDC" : payoutCorridor.currency;
  const receiveAmount = isOnramp ? amountNum / rate : amountNum * rate;
  const missingRecipient = needsRecipient && payoutRecipients.length === 0;

  function changeMode(next: TransferMode) {
    form.setValue("mode", next);
    form.setValue("destinationCorridorId", undefined);
    form.setValue("recipientId", undefined);
  }

  function changeCorridor(next: CorridorId) {
    form.setValue("corridorId", next);
    // Keep the destination distinct and reset the recipient tied to the old payout corridor.
    if (next === form.getValues("destinationCorridorId")) {
      form.setValue("destinationCorridorId", undefined);
    }
    form.setValue("recipientId", undefined);
  }

  function onSubmit(values: FormValues) {
    const recipient = payoutRecipients.find(item => item.id === values.recipientId);
    const counterparty = isOnramp ? `Wallet ${shortenAddress(values.walletAddress)}` : (recipient?.name ?? "Recipient");

    const id = addTransaction({
      accountId: account.id,
      corridorId: isOnramp ? values.corridorId : payoutCorridorId,
      counterparty,
      direction: isOnramp ? "onramp" : "offramp",
      fromAmount: amountNum.toFixed(2),
      fromCurrency: sendCurrency,
      status: "processing",
      toAmount: receiveAmount.toFixed(2),
      toCurrency: receiveCurrency
    });

    const label = isOnramp ? "On-ramp" : isInternational ? "International transfer" : "Off-ramp";
    const summary = `${label} of ${amountNum.toFixed(2)} ${sendCurrency} → ${receiveAmount.toFixed(2)} ${receiveCurrency}`;
    // Simulate the provider settling the transfer shortly after it is triggered.
    setTimeout(() => {
      setTransactionStatus(id, "completed");
      notifyTransferCompleted(summary);
    }, 1800);

    navigate({ to: "/transactions" });
  }

  return (
    <Form {...form}>
      <form className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="mode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Tabs onValueChange={value => changeMode(value as TransferMode)} value={field.value}>
                <TabsList className="w-full">
                  <TabsTrigger value="onramp">
                    <ArrowDownToLine />
                    On-ramp
                  </TabsTrigger>
                  <TabsTrigger value="offramp">
                    <ArrowUpFromLine />
                    Off-ramp
                  </TabsTrigger>
                  <TabsTrigger disabled={!canGoInternational} value="international">
                    <Globe2 />
                    International
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <FormDescription>{descriptionFor(mode, canGoInternational)}</FormDescription>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="corridorId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{isInternational ? "From country" : "Country"}</FormLabel>
              <Select onValueChange={value => changeCorridor(value as CorridorId)} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a country" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {approvedCorridors.map(corridor => (
                    <SelectItem key={corridor.id} value={corridor.id}>
                      {corridor.flag} {corridor.name} · {corridor.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {isInternational && (
          <FormField
            control={form.control}
            name="destinationCorridorId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Destination country</FormLabel>
                <Select
                  onValueChange={value => {
                    field.onChange(value);
                    form.setValue("recipientId", undefined);
                  }}
                  value={field.value ?? ""}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a destination" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {destinationOptions.map(corridor => (
                      <SelectItem key={corridor.id} value={corridor.id}>
                        {corridor.flag} {corridor.name} · {corridor.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormItem>
          <FormLabel>Payment method</FormLabel>
          <Select disabled value={payoutCorridor.recipientMethod}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={payoutCorridor.recipientMethod}>
                {PAYMENT_METHOD_LABEL[payoutCorridor.recipientMethod]} · {payoutCorridor.currency}
              </SelectItem>
            </SelectContent>
          </Select>
          <FormDescription>
            {payoutCorridor.name} settles over {PAYMENT_METHOD_LABEL[payoutCorridor.recipientMethod]}.
          </FormDescription>
        </FormItem>

        {needsRecipient && (
          <FormField
            control={form.control}
            name="recipientId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Recipient</FormLabel>
                <Select disabled={missingRecipient} onValueChange={field.onChange} value={field.value ?? ""}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={missingRecipient ? "No recipients in this country" : "Select a recipient"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {payoutRecipients.map(recipient => (
                      <SelectItem key={recipient.id} value={recipient.id}>
                        {recipient.name} · {recipient.destination}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {missingRecipient ? (
                  <FormDescription>Register a {payoutCorridor.name} recipient first on the Recipients page.</FormDescription>
                ) : (
                  <FormMessage />
                )}
              </FormItem>
            )}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="network"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Wallet network</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TRANSFER_NETWORKS.map(network => (
                      <SelectItem key={network.id} value={network.id}>
                        {network.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="walletAddress"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{isOnramp ? "Destination wallet" : "Source wallet"}</FormLabel>
                <FormControl>
                  <Input className="font-mono" placeholder="0x1a2b…9f0e" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>You send ({sendCurrency})</FormLabel>
              <FormControl>
                <Input inputMode="decimal" placeholder="0.00" {...field} />
              </FormControl>
              {amountNum > 0 && (
                <FormDescription>
                  Recipient gets ≈ {receiveAmount.toFixed(2)} {receiveCurrency}
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <Button className="w-full" disabled={missingRecipient} type="submit">
          {submitLabelFor(mode)}
        </Button>
      </form>
    </Form>
  );
}

function descriptionFor(mode: TransferMode, canGoInternational: boolean) {
  if (mode === "onramp") {
    return "Pay with fiat and receive stablecoin in your wallet.";
  }
  if (mode === "international") {
    return "Send stablecoin and pay a recipient in a different country.";
  }
  return canGoInternational
    ? "Send stablecoin from your wallet and pay a recipient in fiat."
    : "Send stablecoin and pay a recipient in fiat. International transfers unlock with KYB in 2+ countries.";
}

function submitLabelFor(mode: TransferMode) {
  if (mode === "onramp") {
    return "Buy stablecoin";
  }
  if (mode === "international") {
    return "Send international transfer";
  }
  return "Send transfer";
}
