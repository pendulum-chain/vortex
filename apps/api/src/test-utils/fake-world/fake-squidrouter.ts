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
  /** Raw destination amount for a requested route. Default: 1:1 with the input. */
  computeToAmount: (params: RouteParams) => string = params => params.fromAmount;
  toTokenDecimals = 18;
  failNextRoute: Error | null = null;
  readonly requestedRoutes: RouteParams[] = [];

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
          transactionRequest: { value: this.transactionValueWei }
        }
      },
      requestId: "fake-squid-request"
    };
  }
}

export function installFakeSquidRouter(): { fakeSquidRouter: FakeSquidRouter; restore: () => void } {
  const fakeSquidRouter = new FakeSquidRouter();

  mock.module("@vortexfi/shared", () => ({
    ...shared,
    getRoute: (params: RouteParams) => fakeSquidRouter.getRoute(params)
  }));

  return {
    fakeSquidRouter,
    restore: () => {
      mock.module("@vortexfi/shared", () => ({ ...shared }));
    }
  };
}
