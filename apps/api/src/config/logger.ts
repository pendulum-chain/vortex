import { StreamOptions } from "morgan";
import winston, { format } from "winston";
import { getRampId } from "./ramp-context";

interface LogEntry {
  label?: unknown;
  level: unknown;
  message: unknown;
  timestamp?: unknown;
  [key: string]: unknown;
}

const RESERVED_LOG_FIELDS = new Set(["label", "level", "message", "timestamp"]);

function stringifyMetadata(metadata: Record<string, unknown>): string {
  const seen = new WeakSet<object>();

  try {
    return JSON.stringify(metadata, (_key, value: unknown) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);
      }
      return value;
    });
  } catch (error) {
    return JSON.stringify({
      metadataSerializationError: error instanceof Error ? error.message : String(error)
    });
  }
}

export function formatLogEntry(info: LogEntry): string {
  const { timestamp, level, message, label = "" } = info;
  const rampId = getRampId();
  const rampPrefix = rampId ? `[${rampId}] ` : "";
  const timestampPrefix = timestamp ? `[${timestamp}]` : "";
  const metadata = Object.fromEntries(
    Object.entries(info).filter(([key, value]) => !RESERVED_LOG_FIELDS.has(key) && value !== undefined)
  );
  const metadataSuffix = Object.keys(metadata).length > 0 ? ` ${stringifyMetadata(metadata)}` : "";

  return `${timestampPrefix} ${String(level)}${label ? ` ${String(label)}` : ""} ${rampPrefix}${String(message)}${metadataSuffix}`;
}

const customFormat = winston.format.printf(formatLogEntry);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports: [
    new winston.transports.File({
      filename: "error.log",
      format: format.combine(format.timestamp({ format: "MMM D, YYYY HH:mm:ss" }), format.prettyPrint(), customFormat),
      level: "error"
    }),
    new winston.transports.File({
      filename: "combined.log",
      format: format.combine(format.timestamp({ format: "MMM D, YYYY HH:mm:ss" }), format.prettyPrint(), customFormat)
    }),
    new winston.transports.Console({
      format: format.combine(format.colorize(), format.prettyPrint(), customFormat)
    })
  ]
});

const stream: StreamOptions = {
  write: (message: string) => {
    logger.info(message.trim());
  }
};

// @ts-ignore 'morgan'
logger.stream = stream;

export default logger;
