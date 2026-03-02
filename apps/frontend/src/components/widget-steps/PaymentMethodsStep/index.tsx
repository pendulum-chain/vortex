import { useSelector } from "@xstate/react";
import { ALFRED_COUNTRY_METHODS } from "../../../constants/alfredPayMethods";
import {
  useAlfredpayKycSelector,
  usePaymentMethodsActor,
  usePaymentMethodsSelector,
  useRampActor
} from "../../../contexts/rampState";
import { FiatAccountRegistration } from "../../../pages/alfredpay/FiatAccountRegistration";
import { MethodPickerScreen } from "../../../pages/alfredpay/FiatAccountRegistration/MethodPickerScreen";
import { RegisterFiatAccountScreen } from "../../../pages/alfredpay/FiatAccountRegistration/RegisterFiatAccountScreen";
import { MenuButtons } from "../../MenuButtons";

export const PaymentMethodsStep = () => {
  const rampActor = useRampActor();
  const alfredpayData = useAlfredpayKycSelector();
  const country = alfredpayData?.context.country;

  const entrySource = useSelector(rampActor, s => s.context.paymentMethodsEntrySource);
  const isFromKyc = entrySource === "kyc";

  const paymentMethodsActor = usePaymentMethodsActor();
  const paymentMethodsState = usePaymentMethodsSelector();
  const stateValue = paymentMethodsState?.stateValue;
  const selectedMethod = paymentMethodsState?.context.selectedMethod;

  const countryConfig = ALFRED_COUNTRY_METHODS.find(c => c.country === country) ?? ALFRED_COUNTRY_METHODS[0];

  return (
    <div className="flex grow-1 flex-col">
      <MenuButtons />
      {stateValue === "RegisterAccount" && selectedMethod ? (
        <RegisterFiatAccountScreen
          country={country ?? countryConfig.country}
          method={selectedMethod}
          onSuccess={() => paymentMethodsActor?.send({ type: "REGISTER_DONE" })}
        />
      ) : stateValue === "PickMethod" ? (
        <MethodPickerScreen
          countryConfig={countryConfig}
          onSelect={m => paymentMethodsActor?.send({ method: m, type: "SELECT_METHOD" })}
        />
      ) : (
        <>
          <FiatAccountRegistration
            kycApproved
            onAddNew={() => paymentMethodsActor?.send({ type: "ADD_NEW" })}
            preselectedCountry={country}
          />
          {isFromKyc && (
            <button
              className="btn btn-vortex-primary mb-4 w-full"
              onClick={() => rampActor.send({ type: "GO_BACK" })}
              type="button"
            >
              Continue
            </button>
          )}
        </>
      )}
    </div>
  );
};
