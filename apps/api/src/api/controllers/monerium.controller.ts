import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { APIError } from "../errors/api-error";
import { completeMoneriumOAuth, getMoneriumStatus, startMoneriumOAuth } from "../services/monerium/monerium.service";

type CustomerType = "individual" | "business";

function customerType(value: unknown): CustomerType {
  if (value !== "individual" && value !== "business") {
    throw new APIError({ message: "customerType must be individual or business", status: httpStatus.BAD_REQUEST });
  }
  return value;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    throw new APIError({ message: `${name} is required`, status: httpStatus.BAD_REQUEST });
  }
  return value;
}

function authenticatedUser(req: Request): { email: string; userId: string } {
  if (!req.userId || !req.userEmail) {
    throw new APIError({ message: "Authenticated user identity is incomplete", status: httpStatus.UNAUTHORIZED });
  }
  return { email: req.userEmail, userId: req.userId };
}

export async function start(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = authenticatedUser(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (
      body.email !== undefined &&
      (typeof body.email !== "string" || body.email.trim().toLowerCase() !== user.email.toLowerCase())
    ) {
      throw new APIError({ message: "email must match the authenticated user", status: httpStatus.BAD_REQUEST });
    }
    res.status(httpStatus.OK).json(await startMoneriumOAuth(user.userId, user.email, customerType(body.customerType)));
  } catch (error) {
    next(error);
  }
}

export async function complete(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = authenticatedUser(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    res
      .status(httpStatus.OK)
      .json(await completeMoneriumOAuth(user.userId, requiredString(body.code, "code"), requiredString(body.state, "state")));
  } catch (error) {
    next(error);
  }
}

export async function status(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = authenticatedUser(req);
    res.status(httpStatus.OK).json(await getMoneriumStatus(user.userId, customerType(req.query.customerType)));
  } catch (error) {
    next(error);
  }
}
