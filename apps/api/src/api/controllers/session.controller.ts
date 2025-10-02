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
    params.append("walletLocked", body.walletAddressLocked);
  }

  return `${BASE_WIDGET_URL}?${params.toString()}`;
}

function buildRefreshUrl(body: GetWidgetUrlRefresh): string {
  const network = body.rampType === RampDirection.BUY ? body.to : body.from;
  const crypto = body.rampType === RampDirection.BUY ? body.outputCurrency : body.inputCurrency;
  const fiat = body.rampType === RampDirection.BUY ? body.inputCurrency : body.outputCurrency;

  const params = new URLSearchParams({
    cryptoLocked: crypto,
    externalSessionId: body.externalSessionId,
    fiat: fiat,
    inputAmount: body.inputAmount,
    network: network,
    rampType: body.rampType
  });

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
      await quoteService.createQuote({
        from: body.from,
        inputAmount: body.inputAmount,
        inputCurrency: body.inputCurrency,
        outputCurrency: body.outputCurrency,
        rampType: body.rampType,
        to: body.to
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
