import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import type { AlfredpayFiatAccountType } from "@vortexfi/shared";
import type { TFunction } from "i18next";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { z } from "zod";
import { Spinner } from "../../../components/Spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { type FieldDef, FORMS } from "../../../constants/fiatAccountForms";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_TO_ALFRED_TYPE,
  type FiatAccountTypeKey
} from "../../../constants/fiatAccountMethods";
import { useAddFiatAccount } from "../../../hooks/alfredpay/useFiatAccounts";

interface RegisterFiatAccountScreenProps {
  country: string;
  accountType: FiatAccountTypeKey;
  onSuccess: () => void;
}

function buildZodSchema(
  fields: FieldDef[],
  accountType: FiatAccountTypeKey,
  t: TFunction
): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};

  for (const f of fields) {
    let schema: z.ZodType;

    if (f.required) {
      schema = z.string().min(1, t("components.fiatAccountRegistration.validation.fieldRequired", { field: f.label }));
    } else {
      schema = z.string().optional();
    }

    if (f.field === "accountNumber" && accountType === "SPEI") {
      schema = z.string().regex(/^\d{18}$/, t("components.fiatAccountRegistration.validation.clabe"));
    }
    if (f.field === "routingNumber" && (accountType === "ACH" || accountType === "WIRE")) {
      schema = z.string().regex(/^\d{9}$/, t("components.fiatAccountRegistration.validation.routing"));
    }
    if (f.field === "accountNumber" && accountType === "ACH") {
      schema = z.string().regex(/^\d{4,17}$/, t("components.fiatAccountRegistration.validation.accountNumber"));
    }
    if (f.field === "accountNumber" && accountType === "WIRE") {
      schema = z.string().regex(/^\d{4,17}$/, t("components.fiatAccountRegistration.validation.accountNumber"));
    }
    if (f.field === "accountAlias") {
      schema = z.string().max(40, t("components.fiatAccountRegistration.validation.nickname")).optional();
    }

    shape[f.field] = schema;
  }

  return z.object(shape);
}

export function RegisterFiatAccountScreen({ country, accountType, onSuccess }: RegisterFiatAccountScreenProps) {
  const { t } = useTranslation();
  const addFiatAccount = useAddFiatAccount(country);

  const fields: FieldDef[] = FORMS[accountType] ?? [];

  const schema = buildZodSchema(fields, accountType, t);

  const {
    control,
    formState: { errors },
    handleSubmit,
    register
  } = useForm({ resolver: standardSchemaResolver(schema) });

  const alfredType = ACCOUNT_TYPE_TO_ALFRED_TYPE[accountType] as AlfredpayFiatAccountType;

  const onSubmit = async (data: Record<string, unknown>) => {
    const {
      accountAlias,
      accountBankCode,
      accountName,
      accountNumber,
      accountType: accountTypeField,
      networkIdentifier,
      routingNumber,
      bankStreet,
      bankCity,
      bankState,
      bankCountry,
      bankPostalCode
    } = data as Record<string, string>;

    try {
      await addFiatAccount.mutateAsync({
        accountAlias,
        accountBankCode: accountBankCode ?? "",
        accountName: accountName ?? "",
        accountNumber: accountNumber ?? "",
        accountType: accountTypeField ?? "",
        bankCity,
        bankCountry,
        bankPostalCode,
        bankState,
        bankStreet,
        country,
        networkIdentifier,
        routingNumber,
        type: alfredType
      });
      toast.success(t("components.fiatAccountRegistration.registeredSuccess"));
      onSuccess();
    } catch (err: unknown) {
      const apiErr = err as {
        response?: {
          status?: number;
          data?: { error?: string; message?: string; fields?: { field: string; message: string }[] };
        };
      };
      const status = apiErr?.response?.status;
      const body = apiErr?.response?.data;

      if (status === 409) {
        toast.error(t("components.fiatAccountRegistration.alreadyRegistered"));
      } else if (status === 400 && body?.fields) {
        toast.error(body.fields.map(f => `${f.field}: ${f.message}`).join("; "));
      } else {
        toast.error(body?.error || body?.message || t("components.fiatAccountRegistration.registrationError"));
      }
    }
  };

  return (
    <div className="flex grow-1 flex-col">
      <h1 className="mt-4 mb-4 text-center font-bold text-3xl text-primary">{t(ACCOUNT_TYPE_LABELS[accountType])}</h1>

      <form
        className="flex grow-1 flex-col px-4 pt-6 pb-4"
        onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])}
      >
        <div className="grow-1 space-y-4">
          {fields.map(f => (
            <div key={f.field}>
              <label className="mb-1 block text-sm" htmlFor={`field-${f.field}`}>
                {f.label}
              </label>

              {f.type === "select" ? (
                <Controller
                  control={control}
                  name={f.field}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <SelectTrigger
                        className={`input-vortex-primary w-full rounded-lg border bg-transparent p-2 text-base focus-visible:ring-0 focus-visible:ring-offset-0 data-[size=default]:h-auto ${errors[f.field] ? "border-error" : "border-neutral-300"}`}
                        id={`field-${f.field}`}
                      >
                        <SelectValue placeholder={t("components.fiatAccountRegistration.selectPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options?.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              ) : (
                <input
                  className={`input-vortex-primary input-ghost w-full rounded-lg border p-2 text-base ${errors[f.field] ? "border-error" : "border-neutral-300"}`}
                  id={`field-${f.field}`}
                  placeholder={f.placeholder}
                  type={f.type === "phone" ? "tel" : f.type === "email" ? "email" : "text"}
                  {...register(f.field)}
                />
              )}

              {f.hint && <span className="mt-1 block text-gray-500 text-xs">{f.hint}</span>}
              {errors[f.field] && <span className="mt-1 block text-error text-sm">{errors[f.field]?.message as string}</span>}
            </div>
          ))}
        </div>

        <button
          className="btn btn-vortex-primary btn mt-6 w-full transition-transform duration-150 [touch-action:manipulation] active:scale-[97%]"
          disabled={addFiatAccount.isPending}
          type="submit"
        >
          {addFiatAccount.isPending ? <Spinner size="sm" theme="light" /> : t("components.fiatAccountRegistration.save")}
        </button>
      </form>
    </div>
  );
}
