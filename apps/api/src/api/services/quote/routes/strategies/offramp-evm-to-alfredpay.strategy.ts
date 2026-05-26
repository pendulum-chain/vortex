import { StageKey } from "../../core/types";
import { OffRampEvmToAlfredpayFeeEngine } from "../../engines/fee/offramp-evm-to-alfredpay";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";

import { OffRampFromEvmInitializeAlfredpayEngine } from "../../engines/initialize/offramp-from-evm-alfredpay";
import { OfframpTransactionAlfredpayEngine } from "../../engines/partners/offramp-alfredpay";
import { defineRouteStrategy } from "../route-definition";

export const offrampEvmToAlfredpayStrategy = defineRouteStrategy({
  engines: () => ({
    [StageKey.Initialize]: new OffRampFromEvmInitializeAlfredpayEngine(),
    [StageKey.Fee]: new OffRampEvmToAlfredpayFeeEngine(),
    [StageKey.PartnerOperation]: new OfframpTransactionAlfredpayEngine(),
    [StageKey.Finalize]: new OffRampFinalizeEngine()
  }),
  name: "OfframpEvmToAlfredpay",
  stages: [StageKey.Initialize, StageKey.PartnerOperation, StageKey.Fee, StageKey.Finalize]
});
