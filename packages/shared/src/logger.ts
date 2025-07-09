import { StreamOptions } from "morgan";
import winston, { format } from "winston";

export interface ILogger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const customFormat = winston.format.printf(
  ({ timestamp, level, message, label = "" }) => `[${timestamp}] ${level}\t ${label} ${message}`
);

const defaultLogger = winston.createLogger({
  level: "info",
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
      format: format.combine(format.colorize(), winston.format.simple())
    })
  ]
});

const stream: StreamOptions = {
  write: (message: string) => {
    defaultLogger.info(message.trim());
  }
};

// @ts-ignore 'morgan'
defaultLogger.stream = stream;

// We use an object to hold the logger instance. This allows us to change the
// 'current' logger at runtime, and all modules that import 'logger' will
// see the updated instance.
export const logger: { current: ILogger } = {
  current: defaultLogger
};

export function setLogger(newLogger: ILogger): void {
  logger.current = newLogger;
}

export default logger;
