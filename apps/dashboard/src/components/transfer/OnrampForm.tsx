import { zodResolver } from "@hookform/resolvers/zod";
import { getEvmTokensLoadedSnapshot, RampDirection, subscribeEvmTokensLoaded } from "@vortexfi/shared";
import { useSelector } from "@xstate/react";
import { Lock, TriangleAlert } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { useForm } from "react-hook-form";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CORRIDORS } from "@/domain/corridors";
import { getNetworkOptions, getRampTokenOptions, ONRAMP_CORRIDORS } from "@/domain/onramp";
import type { CorridorId, SenderAccount } from "@/domain/types";
import { useApprovedCorridors } from "@/hooks/useApprovedCorridors";
import { transferActor } from "@/machines/transferActor";
import { useQuote } from "@/services/api/hooks";
import { OnrampPaymentInstructions } from "./OnrampPaymentInstructions";
import { QuoteSummary } from "./QuoteSummary";
import { TokenCombobox } from "./TokenCombobox";

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

const schema = z.object({
  amount: z
    .string()
    .regex(AMOUNT_PATTERN, "Enter an amount with at most two decimals.")
    .refine(value => Number(value) > 0, "Enter an amount greater than zero."),
  corridorId: z.string().min(1, "Choose a fiat currency."),
  destinationAddress: z.string().refine((value): boolean => isAddress(value), "Enter a valid EVM wallet address."),
  network: z.string().min(1),
  outputCurrency: z.string().min(1)
});

type OnrampFormValues = z.infer<typeof schema>;

/** Carried over from the quote page so a priced onramp doesn't have to be re-entered. */
interface OnrampPrefill {
  amount?: string;
  corridorId?: CorridorId;
  network?: string;
  token?: string;
}

export function OnrampForm({ account, prefill }: { account: SenderAccount; prefill?: OnrampPrefill }) {
  const { address } = useAccount();
  const { approved } = useApprovedCorridors();
  useSyncExternalStore(subscribeEvmTokensLoaded, getEvmTokensLoadedSnapshot, () => false);
  const tokenOptions = getRampTokenOptions();
  const corridors = ONRAMP_CORRIDORS.filter(corridorId => approved.has(corridorId));
  const networkOptions = getNetworkOptions(tokenOptions);
  // Prefilled values are trusted as-is: the token list and onboarding status may still be
  // loading on first render, when the option lists they'd be validated against are empty.
  const form = useForm<OnrampFormValues>({
    defaultValues: {
      amount: prefill?.amount ?? "",
      corridorId: prefill?.corridorId ?? corridors[0] ?? "",
      destinationAddress: address ?? "",
      network: prefill?.network ?? networkOptions[0]?.id ?? "polygon",
      // Left empty on purpose — the reconciliation effect below is the single place that resolves it.
      outputCurrency: ""
    },
    resolver: zodResolver(schema)
  });

  const network = form.watch("network");
  const corridorId = form.watch("corridorId") as CorridorId;
  const amount = form.watch("amount");
  const outputCurrency = form.watch("outputCurrency");
  const networkTokens = tokenOptions.filter(option => option.network === network);

  useEffect(() => {
    if (address && !form.formState.dirtyFields.destinationAddress) {
      form.setValue("destinationAddress", address);
    }
  }, [address, form]);

  useEffect(() => {
    if (!form.getValues("corridorId") && corridors[0]) {
      form.setValue("corridorId", corridors[0]);
    }
  }, [corridors, form]);

  useEffect(() => {
    if (!networkTokens.some(option => option.currency === outputCurrency)) {
      const preferred = networkTokens.find(option => option.currency === prefill?.token);
      form.setValue("outputCurrency", preferred?.currency ?? networkTokens[0]?.currency ?? "");
    }
  }, [form, networkTokens, outputCurrency, prefill?.token]);

  const quoteParams =
    corridorId && AMOUNT_PATTERN.test(amount) && Number(amount) > 0 && network && outputCurrency
      ? {
          corridorId,
          direction: RampDirection.BUY,
          // The validated string goes to the wire untouched — Number would round large decimals.
          inputAmount: amount,
          network: network as (typeof tokenOptions)[number]["network"],
          token: outputCurrency as (typeof tokenOptions)[number]["currency"]
        }
      : null;
  const { data: quote, error, isFetching } = useQuote(quoteParams);
  const transferState = useSelector(transferActor, snapshot => snapshot);
  const activeTransfer =
    transferState.matches("Registering") ||
    transferState.matches("SigningUserTxs") ||
    transferState.matches("AwaitingPayment") ||
    transferState.matches("Starting") ||
    transferState.matches("Tracking");

  if (transferState.matches("AwaitingPayment") && transferState.context.ramp) {
    return <OnrampPaymentInstructions ramp={transferState.context.ramp} />;
  }

  function submit(values: OnrampFormValues) {
    if (!quote || activeTransfer) {
      return;
    }
    transferActor.send({
      additionalData: { destinationAddress: values.destinationAddress },
      meta: {
        accountId: account.id,
        amountIn: quote.inputAmount,
        amountInToken: String(quote.inputCurrency),
        corridorId: values.corridorId as CorridorId,
        direction: quote.rampType,
        fiatPayoutAmount: quote.outputAmount,
        payinNetwork: values.network,
        payoutCurrency: String(quote.outputCurrency),
        recipientEmail: "Your wallet",
        recipientId: "",
        summary: `${quote.outputAmount} ${quote.outputCurrency} to your wallet`
      },
      quote,
      type: "START"
    });
  }

  if (corridors.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm">
        <Lock className="mt-px size-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">Complete onboarding for a supported corridor before starting an onramp.</p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form className="grid gap-5" onSubmit={form.handleSubmit(submit)}>
        <FormField
          control={form.control}
          name="destinationAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Destination wallet address</FormLabel>
              <FormControl>
                <Input autoComplete="off" placeholder="0x…" {...field} />
              </FormControl>
              <FormDescription>Tokens will be sent here. A wallet connection is not required.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="surface-raised grid gap-4 rounded-lg p-4">
          <FormField
            control={form.control}
            name="corridorId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fiat currency</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {corridors.map(id => (
                      <SelectItem key={id} value={id}>
                        {CORRIDORS[id].flag} {CORRIDORS[id].currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>You pay ({CORRIDORS[corridorId]?.currency})</FormLabel>
                <FormControl>
                  <Input className="text-lg tabular-nums" inputMode="decimal" placeholder="0.00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="network"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Network</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {networkOptions.map(option => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="outputCurrency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Token</FormLabel>
                <FormControl>
                  <TokenCombobox
                    onChange={option => field.onChange(option.currency)}
                    options={networkTokens}
                    value={field.value}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        {transferState.matches("Failed") &&
          transferState.context.errorMessage &&
          transferState.context.quote?.rampType === RampDirection.BUY && (
            <div
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm"
              role="alert"
            >
              <TriangleAlert className="mt-px size-4 shrink-0" />
              <p>{transferState.context.errorMessage}</p>
            </div>
          )}

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm">
            <TriangleAlert className="mt-px size-4 shrink-0" />
            <p>We couldn’t fetch an onramp quote right now. Try another amount or token.</p>
          </div>
        ) : Number(amount) <= 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
            Enter an amount to see the quote.
          </p>
        ) : quote ? (
          <>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <span className="text-muted-foreground text-sm">You receive</span>
              <span className="font-semibold tabular-nums">
                {quote.outputAmount} {String(quote.outputCurrency)}
              </span>
            </div>
            <QuoteSummary isFetching={isFetching} quote={quote} />
            <Button disabled={activeTransfer || isFetching} size="lg" type="submit">
              {transferState.matches("Registering") ? "Preparing payment…" : "Continue to payment"}
            </Button>
          </>
        ) : (
          <Skeleton className="h-36 w-full rounded-lg" />
        )}
      </form>
    </Form>
  );
}
