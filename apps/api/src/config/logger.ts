import { StreamOptions } from 'morgan';
import winston, { format } from 'winston';

const _formatMeta = (meta: any) => {
  // You can format the splat yourself
  const splat = meta[Symbol.for('splat')];
  if (splat && splat.length) {
    return splat.length === 1 ? JSON.stringify(splat[0]) : JSON.stringify(splat);
  }
  return '';
};

const customFormat = winston.format.printf(
  ({ timestamp, level, message, label = '', ...meta }) => `[${timestamp}] ${level}\t ${label} ${message} }`,
);

const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.File({
      filename: 'error.log',
      level: 'error',
      format: format.combine(format.timestamp({ format: 'MMM D, YYYY HH:mm:ss' }), format.prettyPrint(), customFormat),
    }),
    new winston.transports.File({
      filename: 'combined.log',
      format: format.combine(format.timestamp({ format: 'MMM D, YYYY HH:mm:ss' }), format.prettyPrint(), customFormat),
    }),
    new winston.transports.Console({
      format: format.combine(format.colorize(), winston.format.simple()),
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
