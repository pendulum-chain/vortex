import { useNavigate } from "@tanstack/react-router";
import type { AlfredpayFiatPaymentInstructions, RampProcess } from "@vortexfi/shared";
import { useSelector } from "@xstate/react";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resetTransferState, transferActor } from "@/machines/transferActor";

function copy(value: string) {
  navigator.clipboard.writeText(value);
  toast.success("Copied to clipboard");
}

function PaymentRow({ label, value }: { label: string; value: unknown }) {
  const text = typeof value === "string" && value ? value : "Not available";
  return (
    <div className="grid gap-1 border-b py-3 last:border-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex items-center justify-between gap-3">
        <span className="break-all font-medium text-sm">{text}</span>
        {text !== "Not available" && (
          <Button aria-label={`Copy ${label}`} onClick={() => copy(text)} size="icon" type="button" variant="ghost">
            <Copy className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function usdReference(payment: AlfredpayFiatPaymentInstructions): string | undefined {
  const description = payment.paymentDescription;
  const match = description?.match(/:\s*([A-Z0-9]+)\s*$/i);
  return match?.[1] && match[1].length >= 8 ? match[1] : description;
}

function instructionRows(ramp: RampProcess): Array<{ label: string; value: unknown }> {
  const payment = ramp.achPaymentData;
  switch (ramp.inputCurrency) {
    case "MXN":
      return [
        { label: "CLABE", value: payment?.clabe },
        { label: "Bank", value: payment?.bankName },
        { label: "Beneficiary", value: payment?.accountHolderName },
        { label: "Reference", value: payment?.reference },
        { label: "Expires", value: payment?.expirationDate }
      ];
    case "USD":
      return [
        { label: "Beneficiary", value: payment?.bankBeneficiaryName },
        { label: "Routing number (ACH)", value: payment?.bankRoutingNumber },
        { label: "Account number", value: payment?.bankAccountNumber },
        { label: "Account type", value: "Checking" },
        { label: "Amount", value: `${Math.floor(Number(ramp.inputAmount) * 100) / 100} USD` },
        { label: "Payment reference", value: payment ? usdReference(payment) : undefined }
      ];
    case "COP":
      return [
        { label: "Destination account", value: payment?.bankAccountNumber },
        { label: "Bank", value: payment?.bankName },
        { label: "Beneficiary", value: payment?.accountHolderName },
        { label: "Reference", value: payment?.reference },
        { label: "Expires", value: payment?.expirationDate }
      ];
    case "ARS":
      return [
        { label: "CVU", value: payment?.cvu },
        { label: "Alias", value: payment?.alias },
        { label: "Reference", value: payment?.reference },
        { label: "Expires", value: payment?.expirationDate }
      ];
    default:
      return [];
  }
}

export function OnrampPaymentInstructions({ ramp }: { ramp: RampProcess }) {
  const navigate = useNavigate();
  const starting = useSelector(transferActor, snapshot => snapshot.matches("Starting"));
  const rows = instructionRows(ramp);

  function confirmPayment() {
    const subscription = transferActor.subscribe(snapshot => {
      if (snapshot.matches("Tracking")) {
        subscription.unsubscribe();
        toast.success("Onramp initiated", { description: "We’ll update your transaction as the payment settles." });
        navigate({ to: "/transactions" });
      } else if (snapshot.matches("Failed")) {
        subscription.unsubscribe();
        toast.error("Could not start onramp", { description: snapshot.context.errorMessage ?? undefined });
      }
    });
    transferActor.send({ type: "PAYMENT_CONFIRMED" });
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h2 className="font-semibold text-lg">Make your {ramp.inputCurrency} payment</h2>
        <p className="text-muted-foreground text-sm">
          Use the exact details below. Start the transfer only after your payment has been submitted.
        </p>
      </div>

      {ramp.inputCurrency === "BRL" && ramp.depositQrCode ? (
        <div className="grid justify-items-center gap-4 rounded-lg border bg-white p-5 text-black">
          <QRCodeSVG size={184} value={ramp.depositQrCode} />
          <Button onClick={() => copy(ramp.depositQrCode as string)} type="button" variant="outline">
            <Copy /> Copy PIX code
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border px-4">
          {rows.map(row => (
            <PaymentRow key={row.label} {...row} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-[auto_1fr] gap-3">
        <Button disabled={starting} onClick={resetTransferState} size="lg" type="button" variant="outline">
          <ArrowLeft /> Back
        </Button>
        <Button disabled={starting} onClick={confirmPayment} size="lg" type="button">
          <Check /> {starting ? "Starting transfer…" : "I have made the payment"}
        </Button>
      </div>
    </div>
  );
}
