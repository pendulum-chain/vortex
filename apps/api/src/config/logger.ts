import { StreamOptions } from "morgan";
import winston, { format } from "winston";

const customFormat = winston.format.printf(
  ({ timestamp, level, message, label = "" }) => `[${timestamp}] ${level}\t ${label} ${message} }`
);

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
      format: format.combine(format.colorize(), winston.format.simple())
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
