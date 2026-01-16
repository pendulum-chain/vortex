import { StreamOptions } from "morgan";
import winston, { format } from "winston";
import { getRampId } from "./ramp-context";

const customFormat = winston.format.printf(({ timestamp, level, message, label = "" }) => {
  const rampId = getRampId();
  const rampPrefix = rampId ? `[${rampId}] ` : "";
  const timestampPrefix = timestamp ? `[${timestamp}]` : "";
  return `${timestampPrefix} ${level} ${label} ${rampPrefix}${message}`;
});

const logger = winston.createLogger({
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
