import { RampDirection, type UserLimit } from "@vortexfi/shared";
import { formatAmount } from "@/components/quote/AmountPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CORRIDORS } from "@/domain/corridors";
import { useLimits } from "@/hooks/useLimits";

const DIRECTIONS = [RampDirection.BUY, RampDirection.SELL];

function LimitBar({ limit }: { limit: UserLimit }) {
  const max = Number(limit.max);
  const used = Number(limit.used);
  const percentage = max > 0 ? Math.min(100, Math.max(0, (used / max) * 100)) : 0;
  const label = limit.direction === RampDirection.BUY ? "On-ramp" : "Off-ramp";

  return (
    <div className="grid gap-3 rounded-lg border border-border/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-muted-foreground text-xs">Used this month</p>
        </div>
        <p className="text-right text-sm tabular-nums">
          <span className="font-semibold">{formatAmount(limit.used, 2)}</span>
          <span className="text-muted-foreground"> of {formatAmount(limit.max, 2)}</span>
          <span className="ml-1 text-muted-foreground"> {limit.currency}</span>
        </p>
      </div>
      <Progress aria-label={`${label} limit usage`} className="h-1" value={percentage} />
      <p className="text-muted-foreground text-xs">
        Resets{" "}
        {new Date(limit.period.endsAt).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })}
      </p>
    </div>
  );
}

export function LimitsCard() {
  const limits = useLimits();
  const isLoading = limits.isLoadingCorridors || limits.isLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly limits</CardTitle>
        <CardDescription>Track how much of your on-ramp and off-ramp allowance you have used.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-4">
            <Skeleton className="h-9 w-64 max-w-full" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        ) : limits.isError ? (
          <div className="grid justify-items-start gap-3 py-6">
            <p className="text-muted-foreground text-sm">Could not load your monthly limits.</p>
            <Button onClick={() => limits.refetch()} size="sm" variant="outline">
              Try again
            </Button>
          </div>
        ) : limits.corridors.length === 0 ? (
          <p className="py-6 text-muted-foreground text-sm">
            Limits will appear here once onboarding is approved for a supported corridor.
          </p>
        ) : (
          <Tabs defaultValue={limits.corridors[0]} key={limits.corridors.join("-")}>
            <TabsList className="mb-4 max-w-full justify-start overflow-x-auto">
              {limits.corridors.map(corridor => (
                <TabsTrigger key={corridor} value={corridor}>
                  <span aria-hidden>{CORRIDORS[corridor].flag}</span>
                  {CORRIDORS[corridor].name}
                </TabsTrigger>
              ))}
            </TabsList>
            {limits.corridors.map(corridor => {
              const corridorLimits = limits.data?.limits.filter(limit => limit.corridor === corridor) ?? [];
              return (
                <TabsContent key={corridor} value={corridor}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {DIRECTIONS.map(direction => {
                      const limit = corridorLimits.find(item => item.direction === direction);
                      return limit ? <LimitBar key={direction} limit={limit} /> : null;
                    })}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
