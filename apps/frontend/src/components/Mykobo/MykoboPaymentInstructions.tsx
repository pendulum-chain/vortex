import { RampDirection } from "@vortexfi/shared";

interface MykoboPaymentInstructionsProps {
  direction: RampDirection;
  bankAccountName?: string;
  iban?: string;
  receivablesAddress?: string;
  amount?: string;
  reference?: string;
}

export const MykoboPaymentInstructions = ({
  direction,
  bankAccountName,
  iban,
  receivablesAddress,
  amount,
  reference
}: MykoboPaymentInstructionsProps) => {
  if (direction === RampDirection.BUY) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-base-300 bg-base-200 p-4">
        <p className="font-semibold text-body-lg">Send {amount ?? ""} EUR to:</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-secondary-content">Beneficiary</dt>
          <dd className="font-mono">{bankAccountName}</dd>
          <dt className="text-secondary-content">IBAN</dt>
          <dd className="font-mono">{iban}</dd>
          {reference && (
            <>
              <dt className="text-secondary-content">Reference</dt>
              <dd className="font-mono">{reference}</dd>
            </>
          )}
        </dl>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-base-300 bg-base-200 p-4">
      <p className="font-semibold text-body-lg">Send {amount ?? ""} EURC on Base to:</p>
      <p className="break-all font-mono text-sm">{receivablesAddress}</p>
    </div>
  );
};
