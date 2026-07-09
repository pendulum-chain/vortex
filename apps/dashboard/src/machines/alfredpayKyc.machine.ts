import { createAlfredpayKycMachine } from "@vortexfi/kyc";
import { AlfredpayService } from "@/services/api/alfredpay.service";

/**
 * The dashboard's binding of the shared Alfredpay KYC machine. `openVerificationUrl` only fires on
 * the redirect corridors (US), which `routeFor` still sends to `ExternalFlow` — so it is unused
 * today, but the machine requires a way to reach the provider page.
 */
export const alfredpayKycMachine = createAlfredpayKycMachine({
  api: AlfredpayService,
  openVerificationUrl: url => window.open(url, "_blank")
});
