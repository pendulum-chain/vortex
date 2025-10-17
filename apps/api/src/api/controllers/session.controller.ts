import { GetWidgetUrlLocked, GetWidgetUrlRefresh, GetWidgetUrlResponse, RampDirection } from "@packages/shared";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { APIError } from "../errors/api-error";
import quoteService from "../services/ramp/quote.service";

const BASE_WIDGET_URL = process.env.RAMP_WIDGET_URL || "https://www.vortexfinance.co/widget";

function buildLockedUrl(body: GetWidgetUrlLocked): string {
  const params = new URLSearchParams({
    externalSessionId: body.externalSessionId,
    quoteId: body.quoteId
  });
  if (body.walletAddressLocked) {
    params.append("walletAddressLocked", body.walletAddressLocked);
  }

  return `${BASE_WIDGET_URL}?${params.toString()}`;
}

function buildRefreshUrl(body: GetWidgetUrlRefresh): string {
  const params = new URLSearchParams({
    externalSessionId: body.externalSessionId,
    inputAmount: body.inputAmount,
    network: body.network,
    rampType: body.rampType
  });

  if (body.callbackUrl) {
    params.append("callbackUrl", body.callbackUrl);
  }
  if (body.countryCode) {
    params.append("countryCode", body.countryCode);
  }
  if (body.cryptoLocked) {
    params.append("cryptoLocked", body.cryptoLocked);
  }
  if (body.fiat) {
    params.append("fiat", body.fiat);
  }
  if (body.partnerId) {
    params.append("partnerId", body.partnerId);
  }
  if (body.paymentMethod) {
    params.append("paymentMethod", body.paymentMethod);
  }
  if (body.walletAddressLocked) {
    params.append("walletLocked", body.walletAddressLocked);
  }

  return `${BASE_WIDGET_URL}?${params.toString()}`;
}

function isGetWidgetUrlLocked(body: GetWidgetUrlLocked | GetWidgetUrlRefresh): body is GetWidgetUrlLocked {
  return (body as GetWidgetUrlLocked).quoteId !== undefined;
}

export const create = async (
  req: Request<unknown, unknown, GetWidgetUrlLocked | GetWidgetUrlRefresh>,
  res: Response<GetWidgetUrlResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { body } = req;
    if (!body.externalSessionId) {
      throw new APIError({
        message: "externalSessionId is required",
        status: httpStatus.BAD_REQUEST
      });
    }

    if (isGetWidgetUrlLocked(body)) {
      const quote = await quoteService.getQuote(body.quoteId);
      if (!quote || quote.expiresAt < new Date()) {
        throw new APIError({
          message: "Quote not found or expired",
          status: httpStatus.NOT_FOUND
        });
      }

      const url = buildLockedUrl(body);
      res.status(httpStatus.OK).json({ url });
    } else {
      const { network, fiat, inputAmount, paymentMethod, cryptoLocked, rampType } = body;

      const from = rampType === RampDirection.BUY ? paymentMethod : network;
      const to = rampType === RampDirection.BUY ? network : paymentMethod;

      if (!from || !to) {
        throw new APIError({
          message: "Invalid parameters: from and to cannot be determined from the provided rampType and other parameters",
          status: httpStatus.BAD_REQUEST
        });
      }

      const inputCurrency = rampType === RampDirection.BUY ? cryptoLocked : fiat;
      const outputCurrency = rampType === RampDirection.BUY ? fiat : cryptoLocked;

      if (!inputCurrency || !outputCurrency) {
        throw new APIError({
          message: "Invalid parameters: inputCurrency and outputCurrency cannot be determined from the provided parameters",
          status: httpStatus.BAD_REQUEST
        });
      }

      // Create a quote to verify the desired parameters are valid. The quote itself is not used.
      await quoteService.createQuote({
        from,
        inputAmount,
        inputCurrency,
        network,
        outputCurrency,
        rampType,
        to
      });
      const url = buildRefreshUrl(body);
      res.status(httpStatus.CREATED).json({ url });
    }
  } catch (error) {
    // quoteService.getQuote throws a DB error if the quoteId is not a valid uuid.
    if (error instanceof Error && error.message.includes("invalid input syntax for type uuid")) {
      throw new APIError({
        message: "Quote not found or expired",
        status: httpStatus.NOT_FOUND
      });
    }

    next(error);
  }
};
