import { fromPromise } from "xstate";
import { KYCFormData } from "../../../hooks/brla/useKYCForm";
import { isValidCnpj } from "../../../hooks/ramp/schema";
import { createSubaccount } from "../../../services/signingService";

export const submitLevel1Actor = fromPromise(async ({ input }: { input: { taxId: string; formData: KYCFormData } }) => {
  const { taxId, formData } = input;

  const addressObject = {
    cep: formData.cep,
    city: formData.city,
    district: formData.district,
    number: formData.number,
    state: formData.state,
    street: formData.street
  };

  if (isValidCnpj(taxId)) {
    if (!formData.partnerCpf) {
      throw new Error("useKYCProcess: Partner CPF must be defined at this point");
    }

    await createSubaccount({
      ...formData,
      address: addressObject,
      birthdate: formData.birthdate.getTime(),
      cnpj: taxId,
      cpf: formData.partnerCpf,
      startDate: formData.startDate?.getTime(),
      taxIdType: "CNPJ"
    });
  } else {
    await createSubaccount({
      ...formData,
      address: addressObject,
      birthdate: formData.birthdate.getTime(),
      cpf: taxId,
      startDate: formData.startDate?.getTime(),
      taxIdType: "CPF"
    });
  }
});
