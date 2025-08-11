import { isServer } from "./helpers/environment";

export interface ILogger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const browserLogger: ILogger = {
  debug: (...args: unknown[]) => console.debug(...args),
  error: (...args: unknown[]) => console.error(...args),
  info: (...args: unknown[]) => console.info(...args),
  warn: (...args: unknown[]) => console.warn(...args)
};

const loggerInstance: ILogger = browserLogger;

if (isServer()) {
  try {
    import("winston")
      .then(({ default: winston }) => {
        const customFormat = winston.format.printf(
          info => `[${info.timestamp}] ${info.level}\t ${info.label || ""} ${info.message}`
        );

        const serverLogger = winston.createLogger({
          level: "info",
          transports: [
            new winston.transports.File({
              filename: "error.log",
              format: winston.format.combine(
                winston.format.timestamp({ format: "MMM D, YYYY HH:mm:ss" }),
                winston.format.prettyPrint(),
                customFormat
              ),
              level: "error"
            }),
            new winston.transports.File({
              filename: "combined.log",
              format: winston.format.combine(
                winston.format.timestamp({ format: "MMM D, YYYY HH:mm:ss" }),
                winston.format.prettyPrint(),
                customFormat
              )
            }),
            new winston.transports.Console({
              format: winston.format.combine(winston.format.colorize(), winston.format.simple())
            })
          ]
        });

        const stream = {
          write: (message: string) => {
            serverLogger.info(message.trim());
          }
        };

        // @ts-ignore 'morgan'
        serverLogger.stream = stream;

        logger.current = serverLogger;
      })
      .catch(() => {
        console.warn("Winston failed to load, using console logger");
      });
  } catch {
    console.warn("Failed to initialize winston logger, using console logger");
  }
}

export const logger: { current: ILogger } = {
  current: loggerInstance
};

export function setLogger(newLogger: ILogger): void {
  logger.current = newLogger;
}

export default logger;
