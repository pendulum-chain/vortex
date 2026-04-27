import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import type { AlfredpayFiatAccountType } from "@vortexfi/shared";
import type { TFunction } from "i18next";
import { useMemo } from "react";
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
    if (f.type === "checkbox") {
      shape[f.field] = z.boolean().default(false);
      continue;
    }

    let schema: z.ZodType;

    if (f.required) {
      schema = z.string().min(1, t("components.fiatAccountRegistration.validation.fieldRequired", { field: t(f.label) }));
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
    if (f.field === "accountNumber" && accountType === "ACH_COL") {
      schema = z.string().regex(/^\d{10,11}$/, t("components.fiatAccountRegistration.validation.accountNumber"));
    }
    if (f.field === "accountNumber" && accountType === "WIRE") {
      schema = z.string().regex(/^\d{8,34}$/, t("components.fiatAccountRegistration.validation.accountNumber"));
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

  const schema = useMemo(() => buildZodSchema(fields, accountType, t), [fields, accountType, t]);

  const defaultValues = useMemo(
    () => Object.fromEntries(fields.filter(f => f.defaultValue !== undefined).map(f => [f.field, f.defaultValue])),
    [fields]
  );

  const {
    control,
    formState: { errors },
    handleSubmit,
    register
  } = useForm({ defaultValues, resolver: standardSchemaResolver(schema) });

  const alfredType = ACCOUNT_TYPE_TO_ALFRED_TYPE[accountType] as AlfredpayFiatAccountType;

  const onSubmit = async (data: Record<string, unknown>) => {
    const {
      accountBankCode,
      accountName,
      accountNumber,
      accountType: accountTypeField,
      routingNumber,
      bankStreet,
      bankCity,
      bankState,
      bankCountry,
      bankPostalCode,
      documentType,
      documentNumber,
      isOwnAccount
    } = data as Record<string, unknown>;

    try {
      await addFiatAccount.mutateAsync({
        accountBankCode: accountBankCode as string,
        accountName: accountName as string,
        accountNumber: (accountNumber as string) ?? "",
        accountType: accountTypeField as string,
        bankCity: bankCity as string,
        bankCountry: bankCountry as string,
        bankPostalCode: bankPostalCode as string,
        bankState: bankState as string,
        bankStreet: bankStreet as string,
        country,
        documentNumber: documentNumber as string,
        documentType: documentType as string,
        isExternal: (isOwnAccount as string) === "external",
        routingNumber: routingNumber as string,
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
          {fields.map(f => {
            if (f.type === "checkbox") {
              return (
                <div className="flex items-center gap-3" key={f.field}>
                  <input
                    className="checkbox checkbox-primary checkbox-sm"
                    id={`field-${f.field}`}
                    type="checkbox"
                    {...register(f.field)}
                  />
                  <label className="text-sm" htmlFor={`field-${f.field}`}>
                    {t(f.label)}
                  </label>
                </div>
              );
            }

            return (
              <div key={f.field}>
                <label className="mb-1 block text-sm" htmlFor={`field-${f.field}`}>
                  {t(f.label)}
                </label>

                {f.type === "select" ? (
                  <Controller
                    control={control}
                    name={f.field}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <SelectTrigger
                          className={`input-vortex-primary w-full rounded-lg border bg-transparent p-2 text-base focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 data-[size=default]:h-auto ${errors[f.field] ? "border-error" : "border-neutral-300"}`}
                          id={`field-${f.field}`}
                        >
                          <SelectValue placeholder={t("components.fiatAccountRegistration.selectPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {f.options?.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {t(opt.label)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                ) : (
                  <input
                    autoComplete={f.field === "accountName" ? "name" : "off"}
                    className={`input-vortex-primary input-ghost w-full rounded-lg border p-2 text-base ${errors[f.field] ? "border-error" : "border-neutral-300"}`}
                    id={`field-${f.field}`}
                    inputMode={f.field === "routingNumber" || f.field === "accountNumber" ? "numeric" : undefined}
                    placeholder={f.placeholder ? t(f.placeholder) : undefined}
                    spellCheck={f.field === "routingNumber" || f.field === "accountNumber" ? false : undefined}
                    type={f.type === "phone" ? "tel" : f.type === "email" ? "email" : "text"}
                    {...register(f.field)}
                  />
                )}

                {f.hint && <span className="mt-1 block text-gray-500 text-xs">{t(f.hint)}</span>}
                {errors[f.field] && <span className="mt-1 block text-error text-sm">{errors[f.field]?.message as string}</span>}
              </div>
            );
          })}
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
