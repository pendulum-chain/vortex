import { createFileRoute } from "@tanstack/react-router";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { QuoteExplorer } from "@/components/quote/QuoteExplorer";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_app/quote")({
  component: QuotePage
});

function QuotePage() {
  return (
    <Stagger className="mx-auto grid max-w-xl gap-6">
      <StaggerItem>
        <h1 className="text-balance font-semibold text-2xl tracking-tight">Get a quote</h1>
        <p className="text-pretty text-muted-foreground">
          Check live pricing for any supported currency - including ones you haven’t onboarded for yet.
        </p>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardContent>
            <QuoteExplorer />
          </CardContent>
        </Card>
      </StaggerItem>
    </Stagger>
  );
}
