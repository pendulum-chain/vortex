import { Link } from "@tanstack/react-router";
import {
  type EvmNetworks,
  getEvmTokensLoadedSnapshot,
  Networks,
  RampDirection,
  subscribeEvmTokensLoaded
} from "@vortexfi/shared";
import { ArrowDown, ArrowRight, ShieldCheck, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState, useSyncExternalStore } from "react";
import { FiatIcon, NetworkIcon } from "@/components/assets/AssetIcon";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CORRIDOR_LIST, CORRIDORS } from "@/domain/corridors";
import { getNetworkOptions, getRampTokenOptions, ONRAMP_CORRIDORS } from "@/domain/onramp";
import { PAYMENT_METHOD_LABEL } from "@/domain/transfer";
import type { CorridorId } from "@/domain/types";
import { useApprovedCorridors } from "@/hooks/useApprovedCorridors";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { clampDecimals, stripTrailingSeparator } from "@/lib/amount";
import { springSnappy } from "@/lib/motion";
import { useQuote } from "@/services/api/hooks";
import { QuoteSummary } from "../transfer/QuoteSummary";
import { TokenCombobox } from "../transfer/TokenCombobox";
import { AmountInput, AmountPanel, formatAmount } from "./AmountPanel";

const AMOUNT_DEBOUNCE_MS = 400;

// Fiat rails settle to cents; on-chain amounts are quoted at six decimals like the ramp wire format.
const FIAT_DECIMALS = 2;
const TOKEN_DECIMALS = 6;

const OFFRAMP_CORRIDORS: CorridorId[] = CORRIDOR_LIST.map(corridor => corridor.id);
const DEFAULT_CORRIDOR: CorridorId = "BR";

const CHIP_CLASSES =
  "h-11 w-auto shrink-0 gap-2 rounded-full border-0 bg-muted px-3 font-medium text-base shadow-none transition-[color,background-color,box-shadow,scale] hover:bg-muted/60 active:scale-[0.96] motion-reduce:active:scale-100";

// The active pill is drawn by a shared element instead of the trigger's own background, so it can
// slide between the two halves.
const TAB_CLASSES =
  "relative transition-[color,box-shadow,scale] active:scale-[0.96] motion-reduce:active:scale-100 data-[state=active]:bg-transparent data-[state=active]:shadow-none";

export function QuoteExplorer() {
  const [direction, setDirection] = useState<RampDirection>(RampDirection.BUY);
  // `requested*` is what the user last picked; the `active*` value below is what survives
  // reconciliation and is the only one anything reads.
  const [requestedCorridorId, setRequestedCorridorId] = useState<CorridorId>(DEFAULT_CORRIDOR);
  const [requestedNetwork, setRequestedNetwork] = useState<EvmNetworks>(Networks.Polygon);
  const [requestedToken, setRequestedToken] = useState<string>("");
  const [typedAmount, setTypedAmount] = useState("");

  const { approved } = useApprovedCorridors();
  useSyncExternalStore(subscribeEvmTokensLoaded, getEvmTokensLoadedSnapshot, () => false);
  const tokenOptions = getRampTokenOptions();

  const isBuy = direction === RampDirection.BUY;

  // Every selection is derived rather than synced: flipping direction can drop the requested
  // corridor (EU has no onramp) and changing network can drop the requested token.
  const corridors = isBuy ? ONRAMP_CORRIDORS : OFFRAMP_CORRIDORS;
  const activeCorridor = corridors.includes(requestedCorridorId) ? requestedCorridorId : (corridors[0] ?? DEFAULT_CORRIDOR);
  const corridor = CORRIDORS[activeCorridor];

  const networkOptions = getNetworkOptions(tokenOptions);
  // Before the token list loads there are no options, and the requested network still labels the chip.
  const activeNetwork = networkOptions.find(option => option.id === requestedNetwork) ??
    networkOptions[0] ?? { id: requestedNetwork, label: requestedNetwork };
  const networkTokens = tokenOptions.filter(option => option.network === activeNetwork.id);
  const token = networkTokens.find(option => option.currency === requestedToken) ?? networkTokens[0];

  const isApproved = approved.has(activeCorridor);

  const fiatSelector = (
    <Select onValueChange={value => setRequestedCorridorId(value as CorridorId)} value={activeCorridor}>
      <SelectTrigger aria-label="Fiat currency" className={CHIP_CLASSES} id="quote-corridor">
        <FiatIcon currency={corridor.currency} />
        <span>{corridor.currency}</span>
      </SelectTrigger>
      <SelectContent align="start" className="min-w-64">
        {corridors.map(id => (
          <SelectItem className="py-2" key={id} value={id}>
            <FiatIcon currency={CORRIDORS[id].currency} />
            <span className="font-medium">{CORRIDORS[id].currency}</span>
            <span className="text-muted-foreground">{CORRIDORS[id].name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const tokenSelector = (
    <TokenCombobox
      className={CHIP_CLASSES}
      onChange={option => setRequestedToken(option.currency)}
      options={networkTokens}
      value={token?.currency ?? ""}
    />
  );

  const railHint = (
    <>
      <span className="text-muted-foreground">Paid by</span>
      <span className="font-medium">
        {PAYMENT_METHOD_LABEL[corridor.recipientMethod]} · {corridor.name}
      </span>
    </>
  );

  const networkHint = (
    <>
      <span className="text-muted-foreground">Network</span>
      <Select onValueChange={value => setRequestedNetwork(value as EvmNetworks)} value={activeNetwork.id}>
        <SelectTrigger
          aria-label="Network"
          className="h-11 w-auto gap-2 border-0 bg-transparent px-2 font-medium shadow-none transition-[color,background-color,box-shadow,scale] hover:bg-muted active:scale-[0.96] motion-reduce:active:scale-100"
        >
          <NetworkIcon className="size-5" network={activeNetwork.id} />
          <span>{activeNetwork.label}</span>
        </SelectTrigger>
        <SelectContent align="end">
          {networkOptions.map(option => (
            <SelectItem className="py-2" key={option.id} value={option.id}>
              <NetworkIcon className="size-5" network={option.id} />
              <span>{option.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );

  // The one inversion for the whole screen: on BUY the sender pays fiat and receives the token,
  // on SELL it is the other way round. Everything below reads the leg, never `isBuy`.
  const fiatLeg = { decimals: FIAT_DECIMALS, hint: railHint, selector: fiatSelector };
  const tokenLeg = { decimals: TOKEN_DECIMALS, hint: networkHint, selector: tokenSelector };
  const [payLeg, receiveLeg] = isBuy ? [fiatLeg, tokenLeg] : [tokenLeg, fiatLeg];

  // Flipping direction swaps which leg the amount belongs to, so the extra digits are cut rather
  // than sent to a rail that would reject them.
  const amount = clampDecimals(typedAmount, payLeg.decimals);
  const quotedAmount = stripTrailingSeparator(useDebouncedValue(amount, AMOUNT_DEBOUNCE_MS));
  const amountReady = Number(quotedAmount) > 0;

  const quoteParams =
    amountReady && token
      ? {
          corridorId: activeCorridor,
          direction,
          inputAmount: quotedAmount,
          network: activeNetwork.id,
          token: token.currency
        }
      : null;
  const { data: quote, error, isFetching } = useQuote(quoteParams);

  return (
    <div className="grid gap-5">
      <Tabs onValueChange={value => setDirection(value as RampDirection)} value={direction}>
        <TabsList className="grid h-11 w-full grid-cols-2">
          <DirectionTab isActive={isBuy} value={RampDirection.BUY}>
            Buy crypto
          </DirectionTab>
          <DirectionTab isActive={!isBuy} value={RampDirection.SELL}>
            Sell crypto
          </DirectionTab>
        </TabsList>
      </Tabs>

      <div className="grid gap-2">
        <AmountPanel hint={payLeg.hint} label="You pay" labelFor="quote-amount" selector={payLeg.selector}>
          <AmountInput id="quote-amount" maxDecimals={payLeg.decimals} onChange={setTypedAmount} value={amount} />
        </AmountPanel>
        <AmountPanel hint={receiveLeg.hint} label="You receive" selector={receiveLeg.selector}>
          <ReceiveAmount
            amount={quote?.outputAmount}
            isFetching={isFetching}
            isPending={amountReady && !error}
            maxDecimals={receiveLeg.decimals}
          />
        </AmountPanel>
      </div>

      {/* Nothing is rendered here on first paint, so `initial={false}` would have nothing to suppress. */}
      <AnimatePresence mode="wait">
        {error ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm"
            exit={{ opacity: 0, y: -8 }}
            initial={{ opacity: 0, y: 8 }}
            key="error"
            role="alert"
            transition={springSnappy}
          >
            <TriangleAlert className="mt-px size-4 shrink-0" />
            <p className="text-pretty">We couldn’t price that right now. Try another amount, token, or currency.</p>
          </motion.div>
        ) : quote ? (
          // The result is two distinct chunks, so it cascades in rather than landing as one block. The
          // exit is a single fixed shift for the whole group — softer than the enter.
          <Stagger className="grid gap-5" exit={{ opacity: 0, y: -8 }} key="quote" transition={springSnappy}>
            <StaggerItem>
              <QuoteSummary isFetching={isFetching} quote={quote} />
            </StaggerItem>
            <StaggerItem>
              <QuoteCta
                amount={quotedAmount}
                corridorId={activeCorridor}
                isApproved={isApproved}
                isBuy={isBuy}
                network={activeNetwork.id}
                token={token?.currency ?? ""}
              />
            </StaggerItem>
          </Stagger>
        ) : null}
      </AnimatePresence>

      <p className="text-balance text-center text-muted-foreground text-xs">
        Quotes are indicative and refresh automatically. Nothing is reserved until you start a transfer.
      </p>
    </div>
  );
}

interface DirectionTabProps {
  children: ReactNode;
  isActive: boolean;
  value: RampDirection;
}

function DirectionTab({ children, isActive, value }: DirectionTabProps) {
  return (
    <TabsTrigger className={TAB_CLASSES} value={value}>
      {isActive && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-md bg-background shadow-sm"
          layoutId="quote-tab-pill"
          transition={springSnappy}
        />
      )}
      <span className="relative">{children}</span>
    </TabsTrigger>
  );
}

interface ReceiveAmountProps {
  amount: string | undefined;
  isFetching: boolean;
  /** An amount is entered and a quote is on its way — the only state worth a skeleton. */
  isPending: boolean;
  maxDecimals: number;
}

function ReceiveAmount({ amount, isFetching, isPending, maxDecimals }: ReceiveAmountProps) {
  const formatted = amount ? formatAmount(amount, maxDecimals) : null;

  // The live region stays mounted across all three states so a re-quote is announced rather than
  // swallowed by the region itself being replaced.
  return (
    <span aria-live="polite" className="flex min-w-0 items-center">
      {formatted ? (
        // Keyed on the value so a re-price resolves into focus instead of swapping digits in place.
        <motion.span
          animate={{ filter: "blur(0px)", opacity: isFetching ? 0.5 : 1 }}
          className="truncate font-semibold text-2xl tabular-nums"
          initial={{ filter: "blur(4px)", opacity: 0 }}
          key={formatted}
          transition={springSnappy}
        >
          {formatted}
        </motion.span>
      ) : isPending ? (
        <Skeleton className="h-8 w-32" />
      ) : (
        <span className="font-semibold text-2xl text-muted-foreground/50 tabular-nums">0</span>
      )}
    </span>
  );
}

interface QuoteCtaProps {
  amount: string;
  corridorId: CorridorId;
  isApproved: boolean;
  isBuy: boolean;
  network: string;
  token: string;
}

/**
 * The quote page prices corridors the sender may not be approved for, so an unapproved
 * corridor routes to its onboarding rather than to a transfer form that would reject it.
 */
function QuoteCta({ amount, corridorId, isApproved, isBuy, network, token }: QuoteCtaProps) {
  if (!isApproved) {
    return (
      <Button asChild size="lg">
        <Link search={{ onboarding: corridorId }} to="/overview">
          <ShieldCheck />
          Get approved for {CORRIDORS[corridorId].name}
          <ArrowRight />
        </Link>
      </Button>
    );
  }

  // Only BUY carries over: the offramp form is payout-driven and USDC-only, so an
  // input-driven sell quote has no matching fields to prefill.
  const search = isBuy ? { amount, corridorId, mode: "onramp" as const, network, token } : { mode: "offramp" as const };

  return (
    <Button asChild size="lg">
      <Link search={search} to="/transfer">
        Continue to transfer
        <ArrowRight />
      </Link>
    </Button>
  );
}
