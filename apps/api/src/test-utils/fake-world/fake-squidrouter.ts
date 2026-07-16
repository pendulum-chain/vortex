import { mock } from "bun:test";
import type { RouteParams } from "@vortexfi/shared";
import * as shared from "@vortexfi/shared";

/**
 * Fake SquidRouter route source. getRoute is a plain function export of
 * @vortexfi/shared (not a singleton), so it is replaced via mock.module with
 * the rest of the package passed through untouched.
 */
export class FakeSquidRouter {
  /** Native value attached to the route tx (wei); drives the derived network fee. */
  transactionValueWei = "1000000000000000";
  /** Router contract the route's swap tx calls; approve blueprints approve this spender. */
  transactionTarget = "0x00000000000000000000000000000000005a11d0";
  /** Calldata of the route's swap tx (opaque to the corridor code; only echoed back). */
  transactionData = "0x5a11d0000000000000000000000000000000000000000000000000000000000000cafe";
  transactionGasLimit = "500000";
  /** Raw destination amount for a requested route. Default: 1:1 with the input. */
  computeToAmount: (params: RouteParams) => string = params => params.fromAmount;
  toTokenDecimals = 18;
  failNextRoute: Error | null = null;
  readonly requestedRoutes: RouteParams[] = [];
  /** Status the squidRouterPay bridge poll reports. Default: immediate success. */
  bridgeStatus = "success";

  async getRoute(params: RouteParams) {
    if (this.failNextRoute) {
      const error = this.failNextRoute;
      this.failNextRoute = null;
      throw error;
    }
    this.requestedRoutes.push(params);
    return {
      data: {
        route: {
          estimate: {
            toAmount: this.computeToAmount(params),
            toToken: { decimals: this.toTokenDecimals }
          },
          quoteId: "fake-squid-quote",
          transactionRequest: {
            data: this.transactionData,
            gasLimit: this.transactionGasLimit,
            target: this.transactionTarget,
            value: this.transactionValueWei
          }
        }
      },
      requestId: "fake-squid-request"
    };
  }

  /** Fake of the shared getStatus (SquidRouter status API) used by squidRouterPay. */
  async getStatus() {
    return {
      id: "fake-squid-status",
      isGMPTransaction: false,
      routeStatus: [],
      squidTransactionStatus: this.bridgeStatus,
      status: this.bridgeStatus
    };
  }
}

export function installFakeSquidRouter(): { fakeSquidRouter: FakeSquidRouter; restore: () => void } {
  const fakeSquidRouter = new FakeSquidRouter();

  mock.module("@vortexfi/shared", () => ({
    ...shared,
    getRoute: (params: RouteParams) => fakeSquidRouter.getRoute(params),
    getStatus: () => fakeSquidRouter.getStatus()
  }));

  return {
    fakeSquidRouter,
    restore: () => {
      mock.module("@vortexfi/shared", () => ({ ...shared }));
    }
  };
}
