import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

export const winstonConfig: winston.LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    errors({ stack: true }),
    json(),
  ),
  defaultMeta: { service: 'custom-file-upload-pro' },
  transports: [
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === 'development'
          ? combine(
              colorize({ all: true }),
              timestamp({ format: 'HH:mm:ss' }),
              nestWinstonModuleUtilities.format.nestLike('CFUP', {
                prettyPrint: true,
                colors: true,
              }),
            )
          : combine(timestamp(), json()),
    }),
    ...(process.env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 10,
            tailable: true,
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 10 * 1024 * 1024,
            maxFiles: 30,
            tailable: true,
          }),
        ]
      : []),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' }),
  ],
};
