import { createFileRoute } from "@tanstack/react-router";
import { BaseLayout } from "../../layouts";
import { PaymentsPage } from "../../pages/payments";

export const Route = createFileRoute("/{-$locale}/payments")({
  component: PaymentsRouteComponent
});

function PaymentsRouteComponent() {
  return <BaseLayout main={<PaymentsPage />} />;
}
