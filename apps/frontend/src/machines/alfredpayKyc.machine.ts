import { createAlfredpayKycMachine } from "@vortexfi/kyc";
import { AlfredpayService } from "../services/api/alfredpay.service";

/** The widget's binding of the shared Alfredpay KYC machine: its own API client, its own redirect. */
export const alfredpayKycMachine = createAlfredpayKycMachine({
  api: AlfredpayService,
  openVerificationUrl: url => window.open(url, "_blank")
});
