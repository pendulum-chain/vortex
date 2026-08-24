import httpStatus from "http-status";
import { APIError } from "../../../../../errors/api-error";
import type { StartCtx, StartResult } from "../../core/types";
import type { AlfredpayOfframpMetadata } from "./simulation";

export async function startAlfredpayOfframp<Metadata extends AlfredpayOfframpMetadata>(
  ctx: StartCtx<Metadata>
): Promise<StartResult<Metadata>> {
  if (ctx.state.alfredpayTransactionId) {
    return {};
  }
  if (!ctx.metadata?.quoteId) {
    throw new APIError({ message: "Missing provider quote ID in metadata", status: httpStatus.BAD_REQUEST });
  }
  if (!ctx.state.alfredpayUserId) {
    throw new APIError({ message: "Missing provider user ID in ramp state", status: httpStatus.BAD_REQUEST });
  }
  if (!ctx.state.fiatAccountId) {
    throw new APIError({ message: "Missing fiatAccountId in ramp state", status: httpStatus.BAD_REQUEST });
  }
  if (!ctx.state.walletAddress) {
    throw new APIError({ message: "Wallet address not found in ramp state", status: httpStatus.BAD_REQUEST });
  }
  return {};
}
