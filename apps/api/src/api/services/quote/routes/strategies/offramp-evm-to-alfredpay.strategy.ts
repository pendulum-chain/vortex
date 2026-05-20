import { Networks } from "@vortexfi/shared";
import { StageKey } from "../../core/types";
import { OffRampAlfredpayDiscountEngine } from "../../engines/discount/offramp-alfredpay";
import { OffRampEvmToAlfredpayFeeEngine } from "../../engines/fee/offramp-evm-to-alfredpay";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";

import { OffRampFromEvmInitializeEngine } from "../../engines/initialize/offramp-from-evm-alfredpay";
import { OfframpTransactionAlfredpayEngine } from "../../engines/partners/offramp-alfredpay";
import { defineRouteStrategy } from "../route-definition";

export const offrampEvmToAlfredpayStrategy = defineRouteStrategy({
  engines: () => ({
    [StageKey.Initialize]: new OffRampFromEvmInitializeEngine(Networks.Polygon),
    [StageKey.Fee]: new OffRampEvmToAlfredpayFeeEngine(),
    [StageKey.PartnerOperation]: new OfframpTransactionAlfredpayEngine(),
    [StageKey.Discount]: new OffRampAlfredpayDiscountEngine(),
    [StageKey.Finalize]: new OffRampFinalizeEngine()
  }),
  name: "OfframpEvmToAlfredpay",
  stages: [StageKey.Initialize, StageKey.PartnerOperation, StageKey.Fee, StageKey.Discount, StageKey.Finalize]
});
