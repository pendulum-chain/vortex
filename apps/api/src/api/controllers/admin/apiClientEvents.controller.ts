import { Request, Response } from "express";
import httpStatus from "http-status";
import { Op, WhereOptions } from "sequelize";
import logger from "../../../config/logger";
import ApiClientEvent, { ApiClientEventAttributes } from "../../../models/apiClientEvent.model";
import { ApiClientErrorType, ApiClientEventStatus, ApiClientOperation } from "../../observability/types";

type ApiClientEventsQuery = {
  apiKeyPrefix?: string;
  endDate?: string;
  errorType?: ApiClientErrorType;
  limit?: string;
  offset?: string;
  operation?: ApiClientOperation;
  partnerName?: string;
  quoteId?: string;
  rampId?: string;
  requestId?: string;
  startDate?: string;
  status?: ApiClientEventStatus;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const SAFE_EVENT_ATTRIBUTES = [
  "id",
  "requestId",
  "operation",
  "status",
  "httpStatus",
  "errorType",
  "errorMessage",
  "partnerName",
  "apiKeyPrefix",
  "quoteId",
  "rampId",
  "rampType",
  "network",
  "paymentMethod",
  "durationMs",
  "metadata",
  "createdAt"
] satisfies (keyof ApiClientEventAttributes)[];

function parseInteger(value: string | undefined, fallback: number, maximum?: number): number {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;

  return maximum ? Math.min(parsed, maximum) : parsed;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function buildWhere(query: ApiClientEventsQuery): WhereOptions<ApiClientEventAttributes> {
  const where: WhereOptions<ApiClientEventAttributes> = {};

  if (query.apiKeyPrefix) where.apiKeyPrefix = query.apiKeyPrefix;
  if (query.errorType) where.errorType = query.errorType;
  if (query.operation) where.operation = query.operation;
  if (query.partnerName) where.partnerName = query.partnerName;
  if (query.quoteId) where.quoteId = query.quoteId;
  if (query.rampId) where.rampId = query.rampId;
  if (query.requestId) where.requestId = query.requestId;
  if (query.status) where.status = query.status;

  const startDate = parseDate(query.startDate);
  const endDate = parseDate(query.endDate);

  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate ? { [Op.gte]: startDate } : {}),
      ...(endDate ? { [Op.lte]: endDate } : {})
    };
  }

  return where;
}

function buildCounts<T extends string>(
  events: Pick<ApiClientEventAttributes, "errorType" | "operation" | "status">[],
  key: string
) {
  return events.reduce<Record<T, number>>(
    (counts, event) => {
      const value = event[key as keyof typeof event];
      if (typeof value === "string") {
        counts[value as T] = (counts[value as T] ?? 0) + 1;
      }
      return counts;
    },
    {} as Record<T, number>
  );
}

/**
 * GET /v1/admin/api-client-events
 * List sanitized API client observability events for internal dashboards.
 */
export async function listApiClientEvents(
  req: Request<unknown, unknown, unknown, ApiClientEventsQuery>,
  res: Response
): Promise<void> {
  try {
    const limit = parseInteger(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const offset = parseInteger(req.query.offset, 0);
    const where = buildWhere(req.query);

    const [eventsResult, summaryEvents] = await Promise.all([
      ApiClientEvent.findAndCountAll({
        attributes: SAFE_EVENT_ATTRIBUTES,
        limit,
        offset,
        order: [["createdAt", "DESC"]],
        where
      }),
      ApiClientEvent.findAll({
        attributes: ["operation", "status", "errorType"],
        limit: 1000,
        order: [["createdAt", "DESC"]],
        where
      })
    ]);

    res.status(httpStatus.OK).json({
      events: eventsResult.rows,
      limit,
      offset,
      summary: {
        byErrorType: buildCounts<ApiClientErrorType>(summaryEvents, "errorType"),
        byOperation: buildCounts<ApiClientOperation>(summaryEvents, "operation"),
        byStatus: buildCounts<ApiClientEventStatus>(summaryEvents, "status"),
        sampleSize: summaryEvents.length,
        total: eventsResult.count
      },
      total: eventsResult.count
    });
  } catch (error) {
    logger.error("Error listing API client events:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list API client events",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}
