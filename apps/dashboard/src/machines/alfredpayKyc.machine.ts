import { createAlfredpayKycMachine } from "@vortexfi/kyc";
import { AlfredpayService } from "@/services/api/alfredpay.service";

/**
 * The dashboard's binding of the shared Alfredpay KYC machine. `openVerificationUrl` only fires on
 * US hosted KYC/KYB opens in a new tab; MX/CO KYC/KYB stays inside the dashboard.
 */
export const alfredpayKycMachine = createAlfredpayKycMachine({
  api: AlfredpayService,
  openVerificationUrl: url => window.open(url, "_blank")
});
