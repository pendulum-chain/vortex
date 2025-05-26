import { StreamOptions } from 'morgan';
import winston, { format } from 'winston';

const formatMeta = (meta: any) => {
  // You can format the splat yourself
  const splat = meta[Symbol.for('splat')];
  if (splat && splat.length) {
    return splat.length === 1 ? JSON.stringify(splat[0]) : JSON.stringify(splat);
  }
  return '';
};

const customFormat = winston.format.printf(
  ({ timestamp, level, message, label = '', ...meta }) =>
    `[${timestamp}] ${level}\t ${label} ${message} ${formatMeta(meta)}`,
);

const logger = winston.createLogger({
  level: 'info',
  format: format.combine(
    format.prettyPrint(),
    format.colorize(),
    format.timestamp({ format: 'MMM D, YYYY HH:mm' }),
    customFormat,
  ),
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    // This console transport is always active, regardless of environment
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

const stream: StreamOptions = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

// @ts-ignore 'morgan'
logger.stream = stream;

export default logger;
