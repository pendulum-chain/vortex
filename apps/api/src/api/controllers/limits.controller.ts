import { GetUserLimitsRequest, GetUserLimitsResponse, LimitsCorridor } from "@vortexfi/shared";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { getEffectiveUserId } from "../middlewares/effectiveUser";
import { getUserLimits } from "../services/limits.service";

const SUPPORTED_CORRIDORS = new Set<LimitsCorridor>(["AR", "BR", "CO", "MX", "US"]);

function isValidRequest(body: unknown): body is GetUserLimitsRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some(key => key !== "corridors")) return false;
  if (!Array.isArray(record.corridors) || record.corridors.length === 0) return false;
  if (record.corridors.some(corridor => typeof corridor !== "string" || !SUPPORTED_CORRIDORS.has(corridor as LimitsCorridor))) {
    return false;
  }
  return new Set(record.corridors).size === record.corridors.length;
}

export async function getLimits(
  req: Request<unknown, GetUserLimitsResponse, GetUserLimitsRequest>,
  res: Response<GetUserLimitsResponse | { error: string }>,
  next: NextFunction
): Promise<void> {
  const userId = getEffectiveUserId(req);
  if (!userId) {
    res.status(httpStatus.FORBIDDEN).json({ error: "A user-scoped credential is required" });
    return;
  }
  if (!isValidRequest(req.body)) {
    res
      .status(httpStatus.BAD_REQUEST)
      .json({ error: "corridors must be a non-empty, duplicate-free list of AR, BR, CO, MX, or US" });
    return;
  }

  try {
    res.json(await getUserLimits(userId, req.body.corridors));
  } catch (error) {
    next(error);
  }
}
