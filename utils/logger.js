const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Ensure log directory exists
if (!fs.existsSync(config.logging.logPath)) {
  fs.mkdirSync(config.logging.logPath, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
      return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      ),
    }),
    // File output - All logs
    new winston.transports.File({
      filename: path.join(config.logging.logPath, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File output - Error logs only
    new winston.transports.File({
      filename: path.join(config.logging.logPath, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

module.exports = logger;
