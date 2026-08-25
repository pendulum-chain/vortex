import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  type KybQuestionnaireData,
  type KybQuestionnaireValues,
  kybQuestionnaireSchema,
  mapKybQuestionnaireValues
} from "@vortexfi/kyc";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

interface KybQuestionnaireScreenProps {
  /** Answers already given, so stepping back from the documents does not blank the form. */
  defaults?: KybQuestionnaireData;
  onBack: () => void;
  onSubmit: (data: KybQuestionnaireData) => void;
}

/**
 * Alfredpay's compliance questionnaire. Every question here is one Alfredpay requires before it will
 * accept the submission — see GET …/penny/kybRequirements?country=. The two conditionals mirror its
 * `requiredIf`, and answering "regulated business" reveals two more documents on the next step.
 */
export function KybQuestionnaireScreen({ defaults, onBack, onSubmit }: KybQuestionnaireScreenProps) {
  const form = useForm<KybQuestionnaireValues>({
    defaultValues: {
      accountPurpose: defaults?.accountPurpose ?? "",
      businessActivities: defaults?.businessActivities ?? "",
      complianceScreeningDescription: defaults?.complianceScreeningDescription ?? "",
      conductsComplianceScreening: defaults?.conductsComplianceScreening ?? false,
      expectedMonthlyTransactions: defaults?.expectedMonthlyTransactions,
      expectedMonthlyVolumeUsd: defaults?.expectedMonthlyVolumeUsd,
      isRegulatedBusiness: defaults?.isRegulatedBusiness ?? false,
      operatesInSanctionedCountries: defaults?.operatesInSanctionedCountries ?? false,
      sourceOfFunds: defaults?.sourceOfFunds ?? "",
      transmitsCustomerFunds: defaults?.transmitsCustomerFunds ?? false,
      walletAddresses: defaults?.walletAddresses ?? ""
    },
    resolver: standardSchemaResolver(kybQuestionnaireSchema)
  });

  const transmitsCustomerFunds = form.watch("transmitsCustomerFunds");
  const conductsComplianceScreening = form.watch("conductsComplianceScreening");

  const textField = (name: keyof KybQuestionnaireValues, label: string, description?: string, placeholder?: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          {description && <FormDescription>{description}</FormDescription>}
          <FormControl>
            <Input placeholder={placeholder} {...field} value={typeof field.value === "string" ? field.value : ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const numberField = (
    name: "expectedMonthlyVolumeUsd" | "expectedMonthlyTransactions",
    label: string,
    placeholder: string
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              min={0}
              onChange={event => field.onChange(event.target.value === "" ? undefined : event.target.valueAsNumber)}
              placeholder={placeholder}
              type="number"
              value={typeof field.value === "number" ? field.value : ""}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const checkboxField = (
    name: "transmitsCustomerFunds" | "operatesInSanctionedCountries" | "isRegulatedBusiness" | "conductsComplianceScreening",
    label: string,
    description?: string
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-row items-start gap-3 rounded-md border p-3">
          <FormControl>
            <Checkbox checked={!!field.value} onCheckedChange={checked => field.onChange(checked === true)} />
          </FormControl>
          <div className="grid gap-1 leading-none">
            <FormLabel className="font-normal">{label}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(values => onSubmit(mapKybQuestionnaireValues(values)))}>
        <div className="grid max-h-[55vh] gap-4 overflow-y-auto py-2 pr-1">
          <div>
            <h3 className="font-medium">Compliance questionnaire</h3>
            <p className="text-muted-foreground text-sm">Alfredpay requires these answers before it can review the business.</p>
          </div>
          {textField(
            "sourceOfFunds",
            "Source of funds",
            "The primary source of the company's revenue or the funds used with Alfredpay.",
            "Sale of goods/services, investments, venture capital"
          )}
          {textField(
            "businessActivities",
            "Business activities",
            undefined,
            "Money services, lending, FX, virtual currencies brokerage"
          )}
          {textField("accountPurpose", "Primary account purpose", undefined, "Treasury management, cross-border transfers")}
          {textField(
            "walletAddresses",
            "Wallet addresses",
            "List the wallets that will interact with Alfredpay and their chain. Enter N/A if the business will not transact on-chain.",
            "ETH - 0x1234abcd…; TRX - TAbcd1234…"
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {numberField("expectedMonthlyVolumeUsd", "Expected monthly volume (USD)", "50000")}
            {numberField("expectedMonthlyTransactions", "Expected monthly transactions", "120")}
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium">Declarations</h3>
            <p className="text-muted-foreground text-sm">Tick only what applies to the business.</p>
          </div>
          {checkboxField("transmitsCustomerFunds", "We transmit funds on behalf of our customers")}
          {transmitsCustomerFunds &&
            checkboxField("conductsComplianceScreening", "We conduct compliance screening (KYC, KYB and AML)")}
          {transmitsCustomerFunds &&
            conductsComplianceScreening &&
            textField(
              "complianceScreeningDescription",
              "Describe your compliance screening",
              undefined,
              "KYC, KYB and AML checks on every counterparty"
            )}
          {checkboxField("operatesInSanctionedCountries", "We operate in Cuba, Iran, Myanmar, North Korea or Syria")}
          {checkboxField("isRegulatedBusiness", "We perform regulated activities", "Adds two documents to the next step.")}
        </div>
        <DialogFooter className="pt-4">
          <Button onClick={onBack} type="button" variant="ghost">
            Back
          </Button>
          <Button type="submit">Continue</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
