import { zodResolver } from "@hookform/resolvers/zod";
import type { AlfredpayFiatAccountType } from "@vortexfi/shared";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { z } from "zod";
import { Dialog } from "../../../components/Dialog";
import { Spinner } from "../../../components/Spinner";
import { type FieldDef, FORMS } from "../../../constants/alfredPayForms";
import { METHOD_TO_ALFRED_TYPE, type PaymentMethodKey } from "../../../constants/alfredPayMethods";
import { useAddFiatAccount } from "../../../hooks/alfredpay/useFiatAccounts";

interface RegisterFiatAccountSheetProps {
  country: string;
  method: PaymentMethodKey;
  onClose: () => void;
}

function buildZodSchema(fields: FieldDef[], method: PaymentMethodKey): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const f of fields) {
    let schema: z.ZodTypeAny = z.string();

    if (f.required) {
      schema = z.string().min(1, `${f.label} is required`);
    } else {
      schema = z.string().optional();
    }

    if (f.field === "accountNumber" && method === "SPEI") {
      schema = z.string().regex(/^\d{18}$/, "CLABE must be exactly 18 digits");
    }
    if (f.field === "routingNumber" && (method === "ACH" || method === "WIRE")) {
      schema = z.string().regex(/^\d{9}$/, "Routing number must be exactly 9 digits");
    }
    if (f.field === "accountNumber" && method === "ACH") {
      schema = z.string().regex(/^\d{4,17}$/, "Account number must be 4-17 digits");
    }
    if (f.field === "accountNumber" && method === "WIRE") {
      schema = z.string().regex(/^\d{4,17}$/, "Account number must be 4-17 digits");
    }
    if (f.field === "accountAlias") {
      schema = z.string().max(40, "Nickname must be 40 characters or fewer").optional();
    }

    shape[f.field] = schema;
  }

  return z.object(shape);
}

export function RegisterFiatAccountSheet({ country, method, onClose }: RegisterFiatAccountSheetProps) {
  const addFiatAccount = useAddFiatAccount(country);

  const fields: FieldDef[] = FORMS[method] ?? [];

  const schema = buildZodSchema(fields, method);

  const {
    formState: { errors },
    handleSubmit,
    register,
    reset
  } = useForm({ resolver: zodResolver(schema) });

  useEffect(() => {
    reset();
  }, [reset]);

  const alfredType = METHOD_TO_ALFRED_TYPE[method] as AlfredpayFiatAccountType;

  const onSubmit = async (data: Record<string, unknown>) => {
    const {
      accountAlias,
      accountBankCode,
      accountName,
      accountNumber,
      accountType,
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
        accountType: accountType ?? "",
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
      toast.success("Payment method registered successfully.");
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: {
          status?: number;
          data?: { error?: string; message?: string; fields?: { field: string; message: string }[] };
        };
      };
      const status = axiosErr?.response?.status;
      const body = axiosErr?.response?.data;

      if (status === 409) {
        toast.error("This account is already registered.");
      } else if (status === 400 && body?.fields) {
        toast.error(body.fields.map(f => `${f.field}: ${f.message}`).join("; "));
      } else {
        toast.error(body?.error || body?.message || "Could not register account. Please try again.");
      }
    }
  };

  const formContent = (
    <div className="space-y-4">
      {fields.map(f => (
        <div className="mb-4" key={f.field}>
          <label className="mb-1 block text-sm" htmlFor={`field-${f.field}`}>
            {f.label}
          </label>

          {f.type === "select" ? (
            <select
              className={`input-vortex-primary input-ghost w-full rounded-lg border p-2 ${errors[f.field] ? "border-red-800" : "border-neutral-300"}`}
              id={`field-${f.field}`}
              {...register(f.field)}
            >
              <option value="">Select…</option>
              {f.options?.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={`input-vortex-primary input-ghost w-full rounded-lg border p-2 ${errors[f.field] ? "border-red-800" : "border-neutral-300"}`}
              id={`field-${f.field}`}
              placeholder={f.placeholder}
              type={f.type === "phone" ? "tel" : f.type === "email" ? "email" : "text"}
              {...register(f.field)}
            />
          )}

          {f.hint && <span className="mt-1 block text-gray-500 text-xs">{f.hint}</span>}
          {errors[f.field] && <span className="mt-1 block text-red-800 text-sm">{errors[f.field]?.message as string}</span>}
        </div>
      ))}
    </div>
  );

  const formActions = (
    <>
      <button className="btn btn-vortex-primary-inverse btn" onClick={onClose} type="button">
        Cancel
      </button>
      <button className="btn btn-vortex-primary btn" disabled={addFiatAccount.isPending} type="submit">
        {addFiatAccount.isPending ? <Spinner size="sm" theme="light" /> : "Save"}
      </button>
    </>
  );

  return (
    <Dialog
      actions={formActions}
      content={formContent}
      form={{ onSubmit: handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0]) }}
      headerText="Register Payment Method"
      onClose={onClose}
      visible={true}
    />
  );
}
