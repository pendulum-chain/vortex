import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import type { AlfredpayFiatAccountType } from "@vortexfi/shared";
import type { TFunction } from "i18next";
import { Fragment, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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

const FIELD_ATTRS: Record<string, { inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; maxLength?: number }> = {
  accountAlias: { maxLength: 40 },
  accountBankCode: { maxLength: 100 },
  accountName: { maxLength: 100 },
  accountNumber: { inputMode: "numeric", maxLength: 34 },
  bankCity: { maxLength: 50 },
  bankCountry: { maxLength: 3 },
  bankPostalCode: { maxLength: 10 },
  bankState: { maxLength: 50 },
  bankStreet: { maxLength: 100 },
  beneficiaryCity: { maxLength: 50 },
  beneficiaryCountry: { maxLength: 3 },
  beneficiaryPostalCode: { maxLength: 10 },
  beneficiaryState: { maxLength: 50 },
  beneficiaryStreet: { maxLength: 100 },
  routingNumber: { inputMode: "numeric", maxLength: 9 }
};

function schemaForField(f: FieldDef, accountType: FiatAccountTypeKey, t: TFunction): z.ZodType {
  if (f.field === "accountAlias") {
    return z.string().max(40, t("components.fiatAccountRegistration.validation.nickname")).optional();
  }
  if (f.field === "bankCountry" || f.field === "beneficiaryCountry") {
    return z
      .string()
      .refine(val => !val || /^[A-Z]{3}$/.test(val), t("components.fiatAccountRegistration.validation.countryCode"))
      .optional();
  }
  if (f.field === "accountNumber" && accountType === "SPEI") {
    return z.string().regex(/^\d{18}$/, t("components.fiatAccountRegistration.validation.clabe"));
  }
  if (f.field === "routingNumber" && (accountType === "ACH" || accountType === "WIRE")) {
    return z.string().regex(/^\d{9}$/, t("components.fiatAccountRegistration.validation.routing"));
  }
  if (f.field === "accountNumber" && accountType === "ACH") {
    return z.string().regex(/^\d{4,17}$/, t("components.fiatAccountRegistration.validation.accountNumber"));
  }
  if (f.field === "accountNumber" && accountType === "ACH_COL") {
    return z.string().regex(/^\d{10,11}$/, t("components.fiatAccountRegistration.validation.accountNumber"));
  }
  if (f.field === "accountNumber" && accountType === "WIRE") {
    return z.string().regex(/^\d{8,34}$/, t("components.fiatAccountRegistration.validation.accountNumber"));
  }
  if (f.showWhen || !f.required) {
    return z.string().optional();
  }
  return z.string().min(1, t("components.fiatAccountRegistration.validation.fieldRequired", { field: t(f.label) }));
}

function buildZodSchema(
  fields: FieldDef[],
  accountType: FiatAccountTypeKey,
  t: TFunction
): z.ZodObject<Record<string, z.ZodType>> {
  const shape = Object.fromEntries(fields.map(f => [f.field, schemaForField(f, accountType, t)]));
  const base = z.object(shape);

  if (accountType === "WIRE") {
    const conditionalFields = fields.filter(f => f.showWhen);
    return base.superRefine((data, ctx) => {
      if ((data as Record<string, string>).isOwnAccount !== "external") return;
      for (const f of conditionalFields) {
        if (!(data as Record<string, string>)[f.field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t("components.fiatAccountRegistration.validation.fieldRequired", { field: t(f.label) }),
            path: [f.field]
          });
        }
      }
    }) as unknown as z.ZodObject<Record<string, z.ZodType>>;
  }

  return base;
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

  const watchedValues = useWatch({ control }) as Record<string, string | undefined>;
  const visibleFields = useMemo(
    () => fields.filter(f => !f.showWhen || watchedValues[f.showWhen.field] === f.showWhen.value),
    [fields, watchedValues]
  );

  const fieldRows = useMemo(() => {
    const rows: FieldDef[][] = [];
    let i = 0;
    while (i < visibleFields.length) {
      const f = visibleFields[i];
      if (f.halfWidth && visibleFields[i + 1]?.halfWidth) {
        rows.push([f, visibleFields[i + 1]]);
        i += 2;
      } else {
        rows.push([f]);
        i++;
      }
    }
    return rows;
  }, [visibleFields]);

  const alfredType = ACCOUNT_TYPE_TO_ALFRED_TYPE[accountType] as AlfredpayFiatAccountType;

  const onSubmit = async (data: Record<string, string | undefined>) => {
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
      beneficiaryStreet,
      beneficiaryCity,
      beneficiaryState,
      beneficiaryCountry,
      beneficiaryPostalCode,
      documentType,
      documentNumber,
      isOwnAccount
    } = data;

    try {
      await addFiatAccount.mutateAsync({
        accountBankCode,
        accountName,
        accountNumber: accountNumber ?? "",
        accountType: accountTypeField,
        bankCity,
        bankCountry,
        bankPostalCode,
        bankState,
        bankStreet,
        beneficiaryCity,
        beneficiaryCountry,
        beneficiaryPostalCode,
        beneficiaryState,
        beneficiaryStreet,
        country,
        documentNumber,
        documentType,
        isExternal: isOwnAccount === "external",
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
      <h1 className="mt-3 mb-6 text-center font-bold text-3xl text-primary">{t(ACCOUNT_TYPE_LABELS[accountType])}</h1>

      <form
        className="flex grow-1 flex-col px-4 pt-6 pb-4"
        onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])}
      >
        <div className="grow-1 space-y-4">
          {fieldRows.map(row => (
            <Fragment key={row[0].field}>
              {row[0].sectionLabel && (
                <div className="flex items-center gap-2 pt-4">
                  <span className="whitespace-nowrap font-semibold text-neutral-500 text-xs uppercase tracking-widest">
                    {t(row[0].sectionLabel)}
                  </span>
                  <div className="h-px flex-1 bg-base-300" />
                </div>
              )}
              <div className={row.length === 2 ? "grid grid-cols-2 gap-3" : undefined}>
                {row.map(f => (
                  <div key={f.field}>
                    <label className="mb-1.5 block text-sm" htmlFor={`field-${f.field}`}>
                      {t(f.label)}
                    </label>

                    {f.type === "select" ? (
                      <Controller
                        control={control}
                        name={f.field}
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <SelectTrigger
                              aria-describedby={errors[f.field] ? `error-${f.field}` : undefined}
                              aria-invalid={!!errors[f.field]}
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
                        aria-describedby={errors[f.field] ? `error-${f.field}` : undefined}
                        aria-invalid={!!errors[f.field]}
                        autoComplete={f.field === "accountName" ? "name" : "off"}
                        className={`input-vortex-primary input-ghost w-full rounded-lg border p-2 text-base ${errors[f.field] ? "border-error" : "border-neutral-300"}`}
                        id={`field-${f.field}`}
                        inputMode={FIELD_ATTRS[f.field]?.inputMode}
                        maxLength={FIELD_ATTRS[f.field]?.maxLength}
                        placeholder={f.placeholder ? t(f.placeholder) : undefined}
                        spellCheck={FIELD_ATTRS[f.field]?.inputMode === "numeric" ? false : undefined}
                        type={f.type === "phone" ? "tel" : f.type === "email" ? "email" : "text"}
                        {...register(f.field)}
                      />
                    )}

                    {f.hint && <span className="mt-1 block text-gray-500 text-xs">{t(f.hint)}</span>}
                    {errors[f.field] && (
                      <span className="mt-1 block text-error text-sm" id={`error-${f.field}`}>
                        {errors[f.field]?.message}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Fragment>
          ))}
        </div>

        <div className="mt-8 border-base-200 border-t pt-5">
          <button
            className="btn btn-vortex-primary w-full transition-transform duration-150 [touch-action:manipulation] active:scale-[97%]"
            disabled={addFiatAccount.isPending}
            type="submit"
          >
            {addFiatAccount.isPending ? <Spinner size="sm" theme="light" /> : t("components.fiatAccountRegistration.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
