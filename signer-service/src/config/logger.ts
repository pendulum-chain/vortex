import { StreamOptions } from "morgan";
import winston, { format } from "winston";

const logger = winston.createLogger({
  level: "info",
  format: format.combine(
    format.prettyPrint(),
    format.splat(),
    format.printf((info) => {
      if (typeof info.message === "object") {
        info.message = JSON.stringify(info.message, null, 3);
      }

      return info.message;
    })
  ),
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

const stream: StreamOptions = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

// @ts-ignore 'morgan'
logger.stream = stream;

export default logger;
