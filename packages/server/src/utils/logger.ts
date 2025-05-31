import winston from 'winston';

// Create a logger configuration
const loggerConfig = {
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'oceanview' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service, ...rest }) => {
          return `[${timestamp}] [${service}] ${level}: ${message} ${Object.keys(rest).length ? JSON.stringify(rest, null, 2) : ''}`;
        })
      ),
    }),
  ],
};

// Create the logger
const logger = winston.createLogger(loggerConfig);

// Utility functions to simplify logging with context
export const createLogger = (context: string) => {
  const contextLogger = {
    debug: (message: string, meta: any = {}) => {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug(message, { ...meta, context });
      }
    },
    info: (message: string, meta: any = {}) => {
      logger.info(message, { ...meta, context });
    },
    warn: (message: string, meta: any = {}) => {
      logger.warn(message, { ...meta, context });
    },
    error: (message: string, meta: any = {}) => {
      logger.error(message, { ...meta, context });
    }
  };
  
  return contextLogger;
};

export default logger; 